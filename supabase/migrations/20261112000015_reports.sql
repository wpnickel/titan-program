-- Reports: one flat, read-only view of tally cards with everything a report can show or filter on, and saved reports.
-- The view runs with the caller's own access (security_invoker), so row-level security decides which cards a user can see:
-- salespeople their own, managers and owners their dealerships, the super admin everything. No login data is in it.
create view public.report_rows with (security_invoker = true) as
select
  c.id, c.entry_month, c.sale_date, c.created_at,
  c.dealership_id, d.name as dealership,
  c.rep_id, r.first_name || ' ' || r.last_name as rep,
  c.business_name, c.contract_number, c.zip_code,
  c.industry_id, i.name as industry,
  c.customer_type, c.addendum, c.term_months, c.install_amount, c.rmr_amount, c.tcv,
  c.points, c.is_new_logo, c.is_late_entry,
  case when app.is_super_admin() then coalesce(a.status, 'unreviewed') end as audit_status,
  c.comments,
  (select string_agg(p.label, ', ' order by p.sort) from public.tally_card_products cp join public.products p on p.id = cp.product_id where cp.card_id = c.id) as products,
  coalesce((select array_agg(cp.product_id) from public.tally_card_products cp where cp.card_id = c.id), '{}') as product_ids,
  (select string_agg(l.name, ', ' order by l.sort) from public.tally_card_lead_sources cl join public.lead_sources l on l.id = cl.lead_source_id where cl.card_id = c.id) as lead_sources,
  coalesce((select array_agg(cl.lead_source_id) from public.tally_card_lead_sources cl where cl.card_id = c.id), '{}') as lead_source_ids,
  (select count(*) from public.tally_card_files f where f.card_id = c.id)::integer as files
from public.tally_cards c
join public.dealerships d on d.id = c.dealership_id
join public.reps r on r.id = c.rep_id
left join public.industries i on i.id = c.industry_id
left join public.card_audit a on a.card_id = c.id
where c.deleted_at is null and c.submitted;
revoke all on public.report_rows from public, anon;
grant select on public.report_rows to authenticated;

-- Saved reports: a name and the filters and columns that were chosen, kept per person.
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  name text not null check (length(trim(name)) between 1 and 80),
  query text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table public.saved_reports enable row level security;
create policy saved_reports_own on public.saved_reports for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
