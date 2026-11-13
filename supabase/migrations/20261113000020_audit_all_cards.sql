-- Every card is audited, not only the flagged ones. The tags are filters and hints; the list holds all submitted cards.
-- (audit_months keeps its column names: "flagged" now means every card to audit.)
create or replace function public.audit_queue(p_month date)
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
  -- Every submitted card in the month is audited. Cards with no reasons simply carry no tags.
  -- Unreviewed first, then cards waiting for information, then the ones that are done.
  order by case coalesce(a.status, 'unreviewed') when 'unreviewed' then 0 when 'on_hold' then 1 else 2 end, f.sale_date, f.business_name;
end $$;

