begin;
insert into public.dealerships (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Dealership A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Dealership B');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1'),
  ('11111111-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Al', 'A2'),
  ('11111111-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'Bo', 'B1');
insert into auth.users (id, email) select ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'u' || g || '@test' from generate_series(1, 3) g;
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, true, false),
  ('f0000000-0000-0000-0000-000000000003', 'u3@test', 'Al', 'A2', 'salesperson_enters', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', true, true, false, false);
insert into public.months (month_start, status) values ('2026-09-01', 'in_audit'), ('2026-08-01', 'finalized') on conflict do nothing;
insert into public.tally_cards (id, dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '2026-10-01', '2026-10-02', 'Riverside Dental', 'existing', 36, 0, 100),
  ('c1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000003', '2026-10-01', '2026-10-02', 'Riverside Dental Group', 'existing', 36, 0, 100);

create function t.pts_for(p_term int) returns bigint language plpgsql as $$
declare cid uuid;
begin
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount)
  values ('a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', '2026-10-01', '2026-10-02', 'Term ' || p_term, 'existing', p_term, 0, 100) returning id into cid;
  insert into public.tally_card_products (card_id, product_id, quantity) select cid, id, 1 from public.products where key = 's1000';
  perform app.refresh_card_score(cid);
  return (select points from public.tally_cards where id = cid);
end $$;
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('super admin can enter for every rep', 'select count(*) from public.enterable_reps()', 3);
select t.eq('super admin can use open and in-audit months', 'select count(*) from public.enterable_months()', 3);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('team admin can enter for their dealership only', 'select count(*) from public.enterable_reps()', 2);
select t.eq('team admin only sees open months', 'select count(*) from public.enterable_months()', 2);
select t.eq('team admin can edit a card in an open month', $q$select public.can_edit_card('c1000000-0000-0000-0000-000000000001')::int$q$, 1);
select t.eq('team admin cannot edit another dealership''s card', $q$select public.can_edit_card('c1000000-0000-0000-0000-000000000002')::int$q$, 0);
select t.eq('similar name at the same dealership is found', $q$select count(*) from public.similar_customers('a0000000-0000-0000-0000-00000000000a', 'Riverside Dental Group')$q$, 1);
select t.eq('punctuation and case do not matter', $q$select count(*) from public.similar_customers('a0000000-0000-0000-0000-00000000000a', 'RIVERSIDE  dental, inc.')$q$, 1);
select t.eq('a different customer is not similar', $q$select count(*) from public.similar_customers('a0000000-0000-0000-0000-00000000000a', 'Hillcrest Bakery')$q$, 0);
select t.eq('the card being edited is excluded', $q$select count(*) from public.similar_customers('a0000000-0000-0000-0000-00000000000a', 'Riverside Dental', 'c1000000-0000-0000-0000-000000000001')$q$, 0);
select t.eq('other dealerships'' customers are never revealed', $q$select count(*) from public.similar_customers('b0000000-0000-0000-0000-00000000000b', 'Riverside Dental Group')$q$, 0);
select public.add_card_file('c1000000-0000-0000-0000-000000000001', 'c1/a.pdf', 'a.pdf', 1234);
select t.eq('a PDF can be attached', $q$select count(*) from public.tally_card_files where file_name = 'a.pdf'$q$, 1);
select t.throws('cannot attach to another dealership''s card', $q$select public.add_card_file('c1000000-0000-0000-0000-000000000002', 'c2/a.pdf', 'a.pdf', 10)$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000003');
select t.eq('salesperson can enter only for themselves', 'select count(*) from public.enterable_reps()', 1);
select t.throws('salesperson cannot remove a file from a colleague''s card', $q$select public.remove_card_file((select id from public.tally_card_files limit 1))$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('removing a file returns its storage path', $q$select length(public.remove_card_file((select id from public.tally_card_files limit 1)))$q$, 8);
select t.as_owner();

-- Short contracts earn no points ------------------------------------------------------------------
select t.eq('an 11 month contract earns no points', $q$
  select t.pts_for(11)$q$, 0);
select t.eq('a 12 month contract earns its points', $q$
  select t.pts_for(12)$q$, 2);
rollback;
