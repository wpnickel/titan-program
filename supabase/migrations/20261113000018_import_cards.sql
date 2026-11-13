-- Importing history from the old Titan Program.
-- Cards keep their old ID (tally_cards.legacy_id, already there), so importing more than once only adds what is missing.
-- Only the super admin can import. Imported cards never raise late-entry alerts and are never flagged for a missing PDF
-- (a sale dated before its entry month is still marked as a late entry).

alter table public.months add column history_only boolean not null default false;
comment on column public.months.history_only is 'Imported history from before the new scoring rules: locked, searchable in Reports, never on a leaderboard';

-- While an import runs it sets app.importing, so thousands of cards do not each write an audit-log row
-- (one summary row is written per batch instead) and do not raise late-entry alerts.
create or replace function app.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if current_setting('app.importing', true) = 'on' then return coalesce(new, old); end if;
  k := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'month_start', to_jsonb(new) ->> 'card_id',
                to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'month_start', to_jsonb(old) ->> 'card_id');
  insert into public.audit_log (actor_id, table_name, row_key, action, old_row, new_row)
  values (auth.uid(), tg_table_name, k, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function app.raise_late_entry_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.importing', true) = 'on' then return new; end if;
  if new.is_late_entry and new.submitted and new.deleted_at is null then
    insert into public.alerts (kind, card_id, message)
    select 'late_entry', new.id,
           'Late sale: ' || new.business_name || ' (' || r.first_name || ' ' || r.last_name || ', ' || d.name || ') sold '
           || to_char(new.sale_date, 'Mon FMDD, YYYY') || ', entered in ' || to_char(new.entry_month, 'FMMonth YYYY') || '.'
    from public.reps r join public.dealerships d on d.id = r.dealership_id where r.id = new.rep_id
    on conflict (kind, card_id) do nothing;
  end if;
  return new;
end $$;

-- Imported history never becomes "the latest month" on the home page.
create or replace function public.latest_finalized_month() returns date
language sql stable security definer set search_path = '' as $$
  select max(month_start) from public.months where status = 'finalized' and not history_only
$$;

-- Imported cards are never flagged for a missing PDF in the audit queue.
create or replace function public.audit_queue(p_month date)
returns table (card_id uuid, business_name text, rep_name text, dealership text, sale_date date, entry_month date,
               customer_type public.customer_type, addendum boolean, points integer, is_new_logo boolean,
               reasons text[], audit_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  return query
  with base as (
    select c.*, r.first_name || ' ' || r.last_name as rep_name, d.name as dealership,
           (c.id in (select s from public.cards_with_similar_customer(
              array(select x.id from public.tally_cards x where x.entry_month = p_month and x.deleted_at is null)) s)) as similar
    from public.tally_cards c
    join public.reps r on r.id = c.rep_id join public.dealerships d on d.id = c.dealership_id
    where c.entry_month = p_month and c.deleted_at is null and c.submitted
  ), flagged as (
    select b.*, array_remove(array[
      case when b.customer_type = 'new_logo' and not b.addendum then 'new_logo' end,
      case when b.customer_type = 'new_logo' and not b.addendum and b.similar then 'name_match' end,
      case when b.customer_type = 'new_logo' and not b.addendum and not b.is_new_logo then 'failed_checks' end,
      case when b.term_months < 12 then 'under_12' end,
      case when b.is_late_entry then 'late_entry' end,
      case when b.customer_type = 'residential' then 'residential' end,
      -- Imported history has no PDFs, so it is never flagged for a missing upload.
      case when b.legacy_id is null and (b.customer_type <> 'existing' or b.tcv >= 15000)
                and not exists (select 1 from public.tally_card_files f where f.card_id = b.id) then 'missing_pdf' end
    ], null) as reasons
    from base b
  )
  select f.id, f.business_name, f.rep_name, f.dealership, f.sale_date, f.entry_month, f.customer_type, f.addendum,
         f.points, f.is_new_logo, f.reasons, coalesce(a.status, 'unreviewed')
  from flagged f left join public.card_audit a on a.card_id = f.id
  where cardinality(f.reasons) > 0
  order by (a.status is null) desc, f.sale_date, f.business_name;
end $$;


-- Which of these old card IDs are already imported (the Import screen uses this to show what is new).
create function public.import_existing_cards(p_ids integer[]) returns setof integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  return query select c.legacy_id from public.tally_cards c where c.legacy_id = any (p_ids);
end $$;

-- Import a batch of cards. Each row (JSON):
--   legacy_id, rep_legacy_id, dealership_legacy_id, entry_month, sale_date, business_name, zip, industry, customer_type,
--   addendum, contract_number, term, install, rmr, comments, created_at, updated_at, deleted,
--   products {product key: quantity}, lead_sources [names], and
--   recorded mode:  points, new_logo   = exactly what the old system recorded (history before the current rules);
--                   the month is created locked and history-only
--   calculate mode: old_points         = what the old system recorded, kept as an audit override when it differs from the rules
-- Cards already imported are skipped. A card that cannot be imported is reported and the rest still go in.
create function public.import_cards(p_rows jsonb, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_d uuid; v_r uuid; v_id uuid; v_ind uuid; v_month date; v_fin boolean; v_term integer;
  v_calc integer; v_old integer; v_key text; v_pair record; v_nl boolean; v_cat public.customer_type;
  n_ins integer := 0; n_skip integer := 0; n_over integer := 0; v_errs jsonb := '[]'::jsonb;
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if p_mode not in ('recorded', 'calculate') then raise exception 'Unknown import mode.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send at most 500 cards at a time.'; end if;
  perform set_config('app.importing', 'on', true);

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      if exists (select 1 from public.tally_cards where legacy_id = (r ->> 'legacy_id')::integer) then
        n_skip := n_skip + 1; continue;
      end if;
      select id into v_d from public.dealerships where legacy_id = (r ->> 'dealership_legacy_id')::integer;
      select id into v_r from public.reps where legacy_id = (r ->> 'rep_legacy_id')::integer;
      if v_d is null then raise exception 'dealership % is not imported', r ->> 'dealership_legacy_id'; end if;
      if v_r is null then raise exception 'person % is not imported', r ->> 'rep_legacy_id'; end if;

      v_month := (r ->> 'entry_month')::date;
      -- Recorded history goes straight into locked, history-only months, so nothing recalculates it later.
      -- Calculated cards go into open months, which are finalized at the end (import_finalize_months).
      insert into public.months (month_start, status, history_only, finalized_at)
      values (v_month, case when p_mode = 'recorded' then 'finalized' else 'open' end::public.month_status, p_mode = 'recorded',
              case when p_mode = 'recorded' then now() end)
      on conflict (month_start) do nothing;
      select status = 'finalized' and history_only into v_fin from public.months where month_start = v_month;
      if p_mode = 'recorded' and not coalesce(v_fin, false) then
        raise exception '% is a live month, so it cannot be imported with recorded points', to_char(v_month, 'FMMonth YYYY');
      end if;
      select id into v_ind from public.industries where lower(name) = lower(r ->> 'industry');
      if v_ind is null and coalesce(trim(r ->> 'industry'), '') <> '' then
        -- An industry the old system had that the new form does not offer: kept for history, hidden from the form.
        insert into public.industries (name, sort, active) values (trim(r ->> 'industry'), 900, false) returning id into v_ind;
      end if;
      v_cat := (r ->> 'customer_type')::public.customer_type;
      v_term := coalesce((r ->> 'term')::numeric, 0)::integer;

      insert into public.tally_cards (
        legacy_id, dealership_id, rep_id, entry_month, sale_date, business_name, zip_code, industry_id, customer_type, addendum,
        contract_number, term_months, install_amount, rmr_amount, comments, points, is_new_logo, is_late_entry, submitted,
        deleted_at, created_at, updated_at)
      values (
        (r ->> 'legacy_id')::integer, v_d, v_r, v_month, (r ->> 'sale_date')::date, r ->> 'business_name', nullif(r ->> 'zip', ''), v_ind, v_cat,
        coalesce((r ->> 'addendum')::boolean, false), nullif(r ->> 'contract_number', ''), v_term,
        coalesce((r ->> 'install')::numeric, 0), coalesce((r ->> 'rmr')::numeric, 0), nullif(r ->> 'comments', ''),
        case when p_mode = 'recorded' then coalesce((r ->> 'points')::integer, 0) else 0 end,
        case when p_mode = 'recorded' then coalesce((r ->> 'new_logo')::boolean, false) else false end,
        (r ->> 'sale_date')::date < v_month, true,
        case when coalesce((r ->> 'deleted')::boolean, false) then coalesce((r ->> 'updated_at')::timestamptz, now()) end,
        coalesce((r ->> 'created_at')::timestamptz, now()), coalesce((r ->> 'updated_at')::timestamptz, now()))
      returning id, business_key into v_id, v_key;

      insert into public.tally_card_products (card_id, product_id, quantity)
      select v_id, p.id, e.value::numeric::integer
        from jsonb_each_text(coalesce(r -> 'products', '{}'::jsonb)) e join public.products p on p.key = e.key
       where e.value::numeric >= 1;
      insert into public.tally_card_lead_sources (card_id, lead_source_id)
      select distinct v_id, ls.id from jsonb_array_elements_text(coalesce(r -> 'lead_sources', '[]'::jsonb)) n
        join public.lead_sources ls on lower(ls.name) = lower(n) on conflict do nothing;

      if p_mode = 'calculate' and not coalesce((r ->> 'deleted')::boolean, false) then
        v_calc := app.card_points(v_id);
        v_old := (r ->> 'old_points')::integer;
        -- Where the old system recorded something different (a hand adjustment), keep its number and say so.
        if v_old is not null and v_old <> v_calc then
          insert into public.card_audit (card_id, status, points_override, reason, reviewed_by)
          values (v_id, 'adjusted', v_old, 'Imported: the old system recorded ' || v_old || ' point(s); the rules give ' || v_calc || '.', auth.uid());
          v_calc := v_old; n_over := n_over + 1;
        end if;
        -- New logo: meets the rules and is the first card for this company at this dealership.
        v_nl := app.card_meets_new_logo_rules(v_id) and not exists (
          select 1 from public.tally_cards o
           where o.dealership_id = v_d and o.business_key = v_key and o.deleted_at is null and o.id <> v_id
             and (o.entry_month, o.sale_date, o.created_at, o.id) < (v_month, (r ->> 'sale_date')::date, coalesce((r ->> 'created_at')::timestamptz, now()), v_id));
        update public.tally_cards set points = v_calc, is_new_logo = v_nl where id = v_id;
      end if;
      n_ins := n_ins + 1;
    exception when others then
      v_errs := v_errs || jsonb_build_object('legacy_id', r ->> 'legacy_id', 'error', sqlerrm);
    end;
  end loop;

  -- Earlier cards loaded later can change which card is a company's first, so re-check the companies in this batch.
  if p_mode = 'calculate' then
    for v_pair in
      select distinct c.dealership_id, c.business_key from public.tally_cards c
       where c.legacy_id in (select (x ->> 'legacy_id')::integer from jsonb_array_elements(p_rows) x)
    loop
      perform app.refresh_company(v_pair.dealership_id, v_pair.business_key);
    end loop;
  end if;

  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
  values (auth.uid(), 'tally_cards', 'import', 'IMPORT',
          jsonb_build_object('mode', p_mode, 'inserted', n_ins, 'skipped', n_skip, 'point_overrides', n_over, 'errors', jsonb_array_length(v_errs)));
  return jsonb_build_object('inserted', n_ins, 'skipped', n_skip, 'overrides', n_over, 'errors', v_errs);
end $$;

-- After every file is in: lock the calculated months. Each one keeps its rankings (the tie-breaker order is saved
-- and the ranks are snapshotted), exactly as if it had been finalized from the audit screen.
create function public.import_finalize_months(p_through date) returns integer
language plpgsql security definer set search_path = '' as $$
declare m date; n integer := 0;
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  perform set_config('app.importing', 'on', true);
  for m in select month_start from public.months where status = 'open' and month_start <= p_through order by month_start loop
    update public.months set status = 'finalized', finalized_at = now(), updated_at = now(),
           tiebreak_order = (select value from public.app_settings where key = 'tiebreak_order')
     where month_start = m;
    perform app.snapshot_month(m);
    n := n + 1;
  end loop;
  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
  values (auth.uid(), 'months', 'import', 'IMPORT_FINALIZE', jsonb_build_object('through', p_through, 'months', n));
  return n;
end $$;

revoke execute on function public.import_existing_cards(integer[]), public.import_cards(jsonb, text), public.import_finalize_months(date) from public, anon;
grant execute on function public.import_existing_cards(integer[]), public.import_cards(jsonb, text), public.import_finalize_months(date) to authenticated;
