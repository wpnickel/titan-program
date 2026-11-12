begin;
insert into public.dealerships (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Dealer A'), ('b0000000-0000-0000-0000-00000000000b', 'Dealer B'), ('c0000000-0000-0000-0000-00000000000c', 'Dealer C');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A'),
  ('11111111-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Bo', 'B'),
  ('11111111-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c', 'Cy', 'C');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test'), ('f0000000-0000-0000-0000-000000000003', 'u3@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Ann', 'A', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', true, false, false, true),
  ('f0000000-0000-0000-0000-000000000003', 'u3@test', 'Mgr', 'AB', 'manager_owner', 'assigned', null, null, false, false, false, true);
insert into public.profile_dealerships (profile_id, dealership_id) values
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a'), ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b');

create function t.card(p_rep uuid, p_dealer uuid, p_name text, p_products text default null, p_submitted boolean default true, p_deleted boolean default false) returns uuid language plpgsql as $$
declare cid uuid;
begin
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount, points, submitted, deleted_at)
  values (p_dealer, p_rep, '2026-10-01', '2026-10-05', p_name, 'existing', 36, 500, 100, 1, p_submitted, case when p_deleted then now() end) returning id into cid;
  if p_products is not null then
    insert into public.tally_card_products (card_id, product_id, quantity) select cid, id, 1 from public.products where key = any (string_to_array(p_products, ','));
  end if;
  return cid;
end $$;
select t.card('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'A one', 'warranty,s1000');
select t.card('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'A two');
select t.card('11111111-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'B one', 'warranty');
select t.card('11111111-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c', 'C one', 'warranty');
select t.card('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'A draft', null, false);
select t.card('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'A deleted', null, true, true);
insert into public.card_audit (card_id, status, reason) select id, 'approved', 'ok' from public.tally_cards where business_name = 'A one';

select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('the super admin sees every submitted, undeleted card', $q$select count(*) from public.report_rows$q$, 4);
select t.eq('drafts and deleted cards are not in reports', $q$select count(*) from public.report_rows where business_name in ('A draft', 'A deleted')$q$, 0);
select t.eq('the super admin sees audit status', $q$select count(*) from public.report_rows where business_name = 'A one' and audit_status = 'approved'$q$, 1);
select t.eq('products and the product id list are there', $q$select count(*) from public.report_rows where business_name = 'A one' and products like '%Warranty%' and cardinality(product_ids) = 2$q$, 1);
select t.eq('the Warranty filter finds the 3 Warranty cards', $q$select count(*) from public.report_rows where product_ids @> array[(select id from public.products where key = 'warranty')]$q$, 3);
select t.as_owner();

select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('a salesperson sees only their own cards', $q$select count(*) from public.report_rows$q$, 2);
select t.eq('and none from another dealership', $q$select count(*) from public.report_rows where dealership <> 'Dealer A'$q$, 0);
select t.eq('audit status is blank for anyone but the super admin', $q$select count(*) from public.report_rows where audit_status is not null$q$, 0);
select t.as_owner();

select t.as_user('f0000000-0000-0000-0000-000000000003');
select t.eq('a manager sees only their assigned dealerships', $q$select count(*) from public.report_rows$q$, 3);
select t.eq('and not Dealer C', $q$select count(*) from public.report_rows where dealership = 'Dealer C'$q$, 0);
select t.as_owner();

-- Saved reports are private to their owner
select t.as_user('f0000000-0000-0000-0000-000000000002');
insert into public.saved_reports (owner_id, name, query) values ('f0000000-0000-0000-0000-000000000002', 'My report', 'product=warranty');
select t.eq('a user can save a report', $q$select count(*) from public.saved_reports$q$, 1);
select t.throws('but not as someone else', $q$insert into public.saved_reports (owner_id, name, query) values ('f0000000-0000-0000-0000-000000000003', 'Sneaky', 'x')$q$);
select t.throws('names are unique per person', $q$insert into public.saved_reports (owner_id, name, query) values ('f0000000-0000-0000-0000-000000000002', 'My report', 'y')$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000003');
select t.eq('other users cannot see it', $q$select count(*) from public.saved_reports$q$, 0);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('not even the super admin', $q$select count(*) from public.saved_reports$q$, 0);
select t.as_owner();
select t.eq('reports cannot be read when signed out', $q$select (not has_table_privilege('anon', 'public.report_rows', 'select'))::int$q$, 1);
rollback;
