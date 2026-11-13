-- Audit notes, and a way to set a card aside until the supporting information arrives.
-- A card "waiting for information" keeps its notes, is not counted as reviewed, and still shows a warning when the month is finalized.

alter table public.card_audit add column notes text check (notes is null or length(notes) <= 4000);
alter table public.card_audit drop constraint card_audit_status_check;
alter table public.card_audit add constraint card_audit_status_check check (status in ('approved', 'adjusted', 'on_hold'));

-- Approving a card that was waiting for information approves it (notes are kept). An adjusted card stays Adjusted.
create or replace function public.audit_approve(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if not app.audit_month_is_editable(p_card) then raise exception 'That card is in a finalized month.'; end if;
  insert into public.card_audit (card_id, status, reviewed_by) values (p_card, 'approved', auth.uid())
  on conflict (card_id) do update set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where public.card_audit.status in ('approved', 'on_hold');
end $$;

-- Save notes on a card.
--   p_hold = true  : the card is set aside as "waiting for information" (not approved, not counted as reviewed).
--   p_hold = false : only the notes change. An approved or adjusted card keeps its status; a waiting card with the
--                    notes cleared is released back to unreviewed.
create function public.audit_save_notes(p_card uuid, p_notes text, p_hold boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  a public.card_audit;
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if not app.audit_month_is_editable(p_card) then raise exception 'That card is in a finalized month.'; end if;
  if v_notes is not null and length(v_notes) > 4000 then raise exception 'That note is too long.'; end if;
  if p_hold and v_notes is null then raise exception 'Enter a note about what you are waiting for.'; end if;

  select * into a from public.card_audit where card_id = p_card;
  if a.card_id is null then
    if v_notes is null then return; end if;
    insert into public.card_audit (card_id, status, notes, reviewed_by) values (p_card, 'on_hold', v_notes, auth.uid());
  elsif a.status = 'on_hold' and v_notes is null then
    delete from public.card_audit where card_id = p_card;
  else
    update public.card_audit
       set notes = v_notes, status = case when p_hold then 'on_hold' else status end, reviewed_by = auth.uid(), reviewed_at = now()
     where card_id = p_card;
  end if;
end $$;

-- The queue and the month cards now carry the notes and the waiting state.
drop function public.audit_months();
drop function public.audit_queue(date);

create function public.audit_queue(p_month date)
returns table (card_id uuid, business_name text, rep_name text, dealership text, sale_date date, entry_month date,
               customer_type public.customer_type, addendum boolean, points integer, is_new_logo boolean,
               reasons text[], audit_status text, notes text)
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
         f.points, f.is_new_logo, f.reasons, coalesce(a.status, 'unreviewed'), a.notes
  from flagged f left join public.card_audit a on a.card_id = f.id
  where cardinality(f.reasons) > 0
  -- Unreviewed first, then cards waiting for information, then the ones that are done.
  order by case coalesce(a.status, 'unreviewed') when 'unreviewed' then 0 when 'on_hold' then 1 else 2 end, f.sale_date, f.business_name;
end $$;

create function public.audit_months()
returns table (month_start date, status public.month_status, audit_started_at timestamptz, finalized_at timestamptz,
               cards bigint, flagged bigint, reviewed bigint, on_hold bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  return query
  select m.month_start, m.status, m.audit_started_at, m.finalized_at,
         (select count(*) from public.tally_cards c where c.entry_month = m.month_start and c.deleted_at is null and c.submitted),
         (select count(*) from public.audit_queue(m.month_start)),
         (select count(*) from public.audit_queue(m.month_start) q where q.audit_status in ('approved', 'adjusted')),
         (select count(*) from public.audit_queue(m.month_start) q where q.audit_status = 'on_hold')
  from public.months m order by m.month_start desc limit 6;
end $$;

revoke execute on function public.audit_queue(date), public.audit_months(), public.audit_save_notes(uuid, text, boolean)
  from public, anon;
grant execute on function public.audit_queue(date), public.audit_months(), public.audit_save_notes(uuid, text, boolean)
  to authenticated;

-- The Activity panel says what happened in plain words, including notes.
create or replace function public.card_activity(p_card uuid) returns table (at timestamptz, who text, what text)
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
           when l.table_name = 'card_audit' and l.action = 'DELETE' then 'Audit: hold released.'
           when l.table_name = 'card_audit' and (l.new_row ->> 'status') = 'on_hold' then 'Audit: waiting for information. ' || coalesce(l.new_row ->> 'notes', '')
           when l.table_name = 'card_audit' then 'Audit: ' || (l.new_row ->> 'status') || coalesce('. ' || (l.new_row ->> 'reason'), '')
                                                  || case when l.new_row ->> 'notes' is distinct from l.old_row ->> 'notes' and l.new_row ->> 'notes' is not null
                                                          then ' Note: ' || (l.new_row ->> 'notes') else '' end
           when l.table_name = 'tally_card_files' and l.action = 'INSERT' then 'PDF added: ' || (l.new_row ->> 'file_name')
           when l.table_name = 'tally_card_files' and l.action = 'DELETE' then 'PDF removed: ' || (l.old_row ->> 'file_name')
           else l.action || ' ' || l.table_name end
  from public.audit_log l left join public.profiles p on p.id = l.actor_id
  where l.row_key = p_card::text and l.table_name in ('tally_cards', 'card_audit')
     or (l.table_name = 'tally_card_files' and coalesce(l.new_row ->> 'card_id', l.old_row ->> 'card_id') = p_card::text)
  order by l.at desc limit 50;
end $$;
