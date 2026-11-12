begin;
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Dealership A'), ('b0000000-0000-0000-0000-00000000000b', 'Dealership B');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1'),
  ('11111111-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'Bo', 'B1');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Ann', 'A1', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', true, false, false, false);
insert into public.months (month_start, status) values ('2026-10-01', 'open'), ('2026-11-01', 'open') on conflict do nothing;
insert into public.tally_cards (id, dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, rmr_amount, created_at) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '2026-10-01', '2026-10-02', 'Riverside Dental', 'existing', 36, 100, '2026-10-02'),
  ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '2026-11-01', '2026-11-03', 'Riverside Dental Group', 'new_logo', 36, 100, '2026-11-03'),
  ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '2026-11-01', '2026-11-04', 'Hillcrest Bakery', 'new_logo', 36, 100, '2026-11-04'),
  ('c1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000003', '2026-11-01', '2026-11-05', 'Riverside Dental Group', 'new_logo', 36, 100, '2026-11-05');
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('a name that extends an earlier customer is flagged', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000002']::uuid[])$q$, 1);
select t.eq('the earliest card is not flagged', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000001']::uuid[])$q$, 0);
select t.eq('an unrelated name is not flagged', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000003']::uuid[])$q$, 0);
select t.eq('another dealership''s cards do not count', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000004']::uuid[])$q$, 0);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('a salesperson sees flags against colleagues'' cards too', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000002']::uuid[])$q$, 1);
select t.eq('but not for cards at another dealership', $q$select count(*) from public.cards_with_similar_customer(array['c1000000-0000-0000-0000-000000000004']::uuid[])$q$, 0);
select t.as_owner();
rollback;
