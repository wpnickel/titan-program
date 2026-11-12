-- Month calendar and audit: the audit button, audit status and overrides with a reason, late-entry alerts.
-- Only the super admin can use any of this. Every change is also recorded in the audit log.

alter table public.months
  add column audit_started_at timestamptz,
  add column finalized_at timestamptz;

-- Audit status per card. No row = Unreviewed. Overrides replace what the rules calculated, and say why.
create table public.card_audit (
  card_id uuid primary key references public.tally_cards (id),
  status text not null check (status in ('approved', 'adjusted')),
  new_logo_override boolean,
  points_override integer check (points_override is null or points_override >= 0),
  reason text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz not null default now()
);
alter table public.card_audit enable row level security;
create policy card_audit_admin on public.card_audit for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create trigger audit_card_audit after insert or update or delete on public.card_audit
  for each row execute function app.audit_change();
-- (card_audit is keyed by card_id, so name the key for the audit log)
create or replace function app.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  k := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'month_start', to_jsonb(new) ->> 'card_id',
                to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'month_start', to_jsonb(old) ->> 'card_id');
  insert into public.audit_log (actor_id, table_name, row_key, action, old_row, new_row)
  values (auth.uid(), tg_table_name, k, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- In-app notifications for the super admin (late sales for now).
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  card_id uuid references public.tally_cards (id),
  message text not null,
  read_at timestamptz,
  emailed_at timestamptz,
  unique (kind, card_id)
);
alter table public.alerts enable row level security;
create policy alerts_admin on public.alerts for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

-- A card whose sale date is before its entry month raises one late-entry alert.
create function app.raise_late_entry_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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
create trigger tally_cards_late_alert after insert or update of submitted, sale_date, entry_month on public.tally_cards
  for each row execute function app.raise_late_entry_alert();

-- Overrides win over the calculated points and new-logo flag. Finalized months are still never touched.
create or replace function app.refresh_company(p_dealership uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  with ordered as (
    select c.id,
           row_number() over (order by c.entry_month, c.sale_date, c.created_at, c.id) as rn
    from public.tally_cards c
    where c.dealership_id = p_dealership and c.business_key = p_key and c.deleted_at is null
  ), calc as (
    select o.id,
           coalesce(a.points_override, app.card_points(o.id)) as pts,
           coalesce(a.new_logo_override, o.rn = 1 and app.card_meets_new_logo_rules(o.id)) as nl
    from ordered o left join public.card_audit a on a.card_id = o.id
  )
  update public.tally_cards c
     set points = calc.pts, is_new_logo = calc.nl, updated_at = now()
    from calc
   where c.id = calc.id
     and not exists (select 1 from public.months m where m.month_start = c.entry_month and m.status = 'finalized')
     and (c.points, c.is_new_logo) is distinct from (calc.pts, calc.nl);

  update public.tally_cards c set points = 0, is_new_logo = false
   where c.dealership_id = p_dealership and c.business_key = p_key and c.deleted_at is not null
     and (c.points <> 0 or c.is_new_logo)
     and not exists (select 1 from public.months m where m.month_start = c.entry_month and m.status = 'finalized');
end $$;

-- The audit button ------------------------------------------------------------------------------
-- Audit October: October locks, November stays open, and December opens (it never opens on its own date).
create function public.start_audit(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.months;
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  select * into m from public.months where month_start = p_month;
  if m.month_start is null or m.status <> 'open' then raise exception 'That month is not open.'; end if;
  if exists (select 1 from public.months where month_start < p_month and status = 'open') then
    raise exception 'Audit the earlier month first.';
  end if;
  update public.months set status = 'in_audit', audit_started_at = now(), updated_at = now() where month_start = p_month;
  insert into public.months (month_start, status)
    values ((p_month + interval '1 month')::date, 'open'), ((p_month + interval '2 months')::date, 'open')
    on conflict (month_start) do nothing;
end $$;

-- Finalize: locks the month for everyone. Its points and new-logo flags are frozen and it feeds the year-to-date boards.
create function public.finalize_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if not exists (select 1 from public.months where month_start = p_month and status = 'in_audit') then
    raise exception 'Only a month that is in audit can be finalized.';
  end if;
  update public.months set status = 'finalized', finalized_at = now(), updated_at = now() where month_start = p_month;
end $$;

-- Reopen a finalized month for more audit work. Needs a reason, which is logged.
create function public.reopen_month(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for reopening.'; end if;
  if not exists (select 1 from public.months where month_start = p_month and status = 'finalized') then
    raise exception 'Only a finalized month can be reopened.';
  end if;
  update public.months set status = 'in_audit', finalized_at = null, updated_at = now() where month_start = p_month;
  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
    values (auth.uid(), 'months', p_month::text, 'REOPEN', jsonb_build_object('reason', trim(p_reason)));
end $$;

-- The review queue -----------------------------------------------------------------------------
-- Submitted cards in a month that need a look, with the reasons. Cards with no reasons are not in the queue.
create function public.audit_queue(p_month date)
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
      case when (b.customer_type <> 'existing' or b.tcv >= 15000)
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

-- Month cards for the audit page: state, dates, and how much of the queue is reviewed.
create function public.audit_months()
returns table (month_start date, status public.month_status, audit_started_at timestamptz, finalized_at timestamptz,
               cards bigint, flagged bigint, reviewed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  return query
  select m.month_start, m.status, m.audit_started_at, m.finalized_at,
         (select count(*) from public.tally_cards c where c.entry_month = m.month_start and c.deleted_at is null and c.submitted),
         (select count(*) from public.audit_queue(m.month_start)),
         (select count(*) from public.audit_queue(m.month_start) q where q.audit_status <> 'unreviewed')
  from public.months m order by m.month_start desc limit 6;
end $$;

-- Review actions -----------------------------------------------------------------------------------
create function app.audit_month_is_editable(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tally_cards c join public.months m on m.month_start = c.entry_month
                 where c.id = p_card and c.deleted_at is null and m.status in ('open', 'in_audit'))
$$;

-- Mark a card as checked and fine. A card that was already adjusted stays Adjusted.
create function public.audit_approve(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if not app.audit_month_is_editable(p_card) then raise exception 'That card is in a finalized month.'; end if;
  insert into public.card_audit (card_id, status, reviewed_by) values (p_card, 'approved', auth.uid())
  on conflict (card_id) do update set reviewed_by = auth.uid(), reviewed_at = now()
    where public.card_audit.status = 'approved';
end $$;

-- Change what the rules calculated. p: card_id, reason (required), and any of
--   customer_type, new_logo ('auto' | true | false), points ('auto' | number).
create function public.audit_adjust(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_card uuid := (p ->> 'card_id')::uuid;
  v_reason text := trim(coalesce(p ->> 'reason', ''));
  a public.card_audit;
  v_nl boolean; v_pts integer;
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if v_reason = '' then raise exception 'Enter a reason for the change.'; end if;
  if not app.audit_month_is_editable(v_card) then raise exception 'That card is in a finalized month.'; end if;

  select * into a from public.card_audit where card_id = v_card;
  v_nl := a.new_logo_override; v_pts := a.points_override;
  if p ? 'new_logo' then v_nl := case when p ->> 'new_logo' = 'auto' then null else (p ->> 'new_logo')::boolean end; end if;
  if p ? 'points' then v_pts := case when p ->> 'points' = 'auto' then null else (p ->> 'points')::integer end; end if;

  if p ? 'customer_type' then
    update public.tally_cards set customer_type = (p ->> 'customer_type')::public.customer_type, updated_at = now() where id = v_card;
  end if;
  insert into public.card_audit (card_id, status, new_logo_override, points_override, reason, reviewed_by)
    values (v_card, 'adjusted', v_nl, v_pts, v_reason, auth.uid())
  on conflict (card_id) do update
    set status = 'adjusted', new_logo_override = v_nl, points_override = v_pts, reason = v_reason, reviewed_by = auth.uid(), reviewed_at = now();
  perform app.refresh_card_score(v_card);
end $$;

-- A card's history for the Activity panel: audit-log rows about the card, newest first.
create function public.card_activity(p_card uuid) returns table (at timestamptz, who text, what text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  return query
  select l.at, coalesce(p.first_name || ' ' || p.last_name, 'System'),
         case
           when l.table_name = 'tally_cards' and l.action = 'INSERT' then 'Card created.'
           when l.table_name = 'tally_cards' and l.action = 'UPDATE' and (l.old_row ->> 'submitted') = 'false' and (l.new_row ->> 'submitted') = 'true' then 'Card submitted.'
           when l.table_name = 'tally_cards' and l.action = 'UPDATE' and (l.old_row ->> 'deleted_at') is null and (l.new_row ->> 'deleted_at') is not null then 'Card deleted.'
           when l.table_name = 'tally_cards' and l.action = 'UPDATE' then 'Card edited.'
           when l.table_name = 'card_audit' then 'Audit: ' || (l.new_row ->> 'status') || coalesce('. ' || (l.new_row ->> 'reason'), '')
           when l.table_name = 'tally_card_files' and l.action = 'INSERT' then 'PDF added: ' || (l.new_row ->> 'file_name')
           when l.table_name = 'tally_card_files' and l.action = 'DELETE' then 'PDF removed: ' || (l.old_row ->> 'file_name')
           else l.action || ' ' || l.table_name end
  from public.audit_log l left join public.profiles p on p.id = l.actor_id
  where l.row_key = p_card::text and l.table_name in ('tally_cards', 'card_audit')
     or (l.table_name = 'tally_card_files' and coalesce(l.new_row ->> 'card_id', l.old_row ->> 'card_id') = p_card::text)
  order by l.at desc limit 50;
end $$;

revoke execute on function public.start_audit(date), public.finalize_month(date), public.reopen_month(date, text),
  public.audit_queue(date), public.audit_months(), public.audit_approve(uuid), public.audit_adjust(jsonb), public.card_activity(uuid)
  from public, anon;
grant execute on function public.start_audit(date), public.finalize_month(date), public.reopen_month(date, text),
  public.audit_queue(date), public.audit_months(), public.audit_approve(uuid), public.audit_adjust(jsonb), public.card_activity(uuid)
  to authenticated;
