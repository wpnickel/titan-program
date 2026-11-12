begin;
insert into public.dealerships (id, name, is_securitas) values
  ('5e000000-0000-0000-0000-000000000005', 'Securitas', true), ('a0000000-0000-0000-0000-00000000000a', 'Dealer A', false);
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'Olive', 'Other'),
  ('11111111-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Otto', 'Other'),
  ('11111111-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'Opal', 'Other'),
  ('11111111-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000005', 'Sam', 'Secur'),
  ('11111111-0000-0000-0000-0000000000b2', '5e000000-0000-0000-0000-000000000005', 'Sue', 'Secur'),
  ('11111111-0000-0000-0000-0000000000b3', '5e000000-0000-0000-0000-000000000005', 'Zed', 'Secur');
insert into auth.users (id, email) select ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'u' || g || '@test' from generate_series(1, 5) g;
-- 1 super admin, 2 Securitas salesperson, 3 other-dealership salesperson, 4 manager assigned to Securitas, 5 team admin at Securitas
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Sam', 'Secur', 'salesperson_view', 'own', '5e000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-0000000000b1', true, false, false, false),
  ('f0000000-0000-0000-0000-000000000003', 'u3@test', 'Olive', 'Other', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-0000000000a1', true, false, false, false),
  ('f0000000-0000-0000-0000-000000000004', 'u4@test', 'Mia', 'Mgr', 'manager_owner', 'assigned', null, null, false, false, false, true),
  ('f0000000-0000-0000-0000-000000000005', 'u5@test', 'Tia', 'Team', 'team_admin', 'dealership', '5e000000-0000-0000-0000-000000000005', null, false, false, true, false);
insert into public.profile_dealerships (profile_id, dealership_id) values ('f0000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000005');

delete from public.months;
insert into public.months (month_start, status) values ('2026-09-01', 'finalized'), ('2026-10-01', 'open'), ('2026-11-01', 'open');
create function t.card(p_rep text, p_month date, p_rmr numeric, p_inst numeric, p_nl boolean, p_pts int) returns void language sql as $$
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount, points, is_new_logo)
  select r.dealership_id, r.id, p_month, p_month + 3, 'Co ' || gen_random_uuid()::text, 'existing', 36, p_inst, p_rmr, p_pts, p_nl from public.reps r where r.first_name = p_rep
$$;
-- Company-wide the three Dealer A reps beat every Securitas rep; among Securitas, Sam > Sue > Zed.
select t.card('Olive', '2026-10-01', 900, 900, true, 9); select t.card('Otto', '2026-10-01', 800, 800, true, 8); select t.card('Opal', '2026-10-01', 700, 700, true, 7);
select t.card('Sam', '2026-10-01', 300, 300, true, 3); select t.card('Sue', '2026-10-01', 200, 200, true, 2); select t.card('Zed', '2026-10-01', 100, 100, true, 1);
select t.card('Sam', '2026-09-01', 50, 50, true, 1);
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.start_audit('2026-10-01'); select public.finalize_month('2026-10-01');
select t.as_owner();

-- Who can see them -------------------------------------------------------------------------------------
create function t.access_for(uid text) returns int language plpgsql as $$
declare r boolean;
begin perform t.as_user(uid::uuid); r := public.securitas_access(); perform t.as_owner(); return r::int; end $$;
select t.eq('the super admin has access', $q$select t.access_for('f0000000-0000-0000-0000-000000000001')$q$, 1);
select t.eq('a Securitas salesperson has access', $q$select t.access_for('f0000000-0000-0000-0000-000000000002')$q$, 1);
select t.eq('a manager assigned to Securitas has access', $q$select t.access_for('f0000000-0000-0000-0000-000000000004')$q$, 1);
select t.eq('Securitas entry staff have access', $q$select t.access_for('f0000000-0000-0000-0000-000000000005')$q$, 1);
select t.eq('another dealership does not', $q$select t.access_for('f0000000-0000-0000-0000-000000000003')$q$, 0);

-- What they see ------------------------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('only Securitas reps are listed', $q$select count(*) from public.securitas_board('month', '2026-10-01') where dealership <> 'Securitas'$q$, 0);
select t.eq('all three Securitas reps are listed', $q$select count(*) from public.securitas_board('month', '2026-10-01')$q$, 3);
select t.eq('ranks are among Securitas only: Sam is 1st in every category and overall', $q$select count(*) from public.securitas_board('month', '2026-10-01') where first_name = 'Sam' and rmr_rank = 1 and install_rank = 1 and new_logo_rank = 1 and points_rank = 1 and overall_rank = 1$q$, 1);
select t.eq('Sue 2nd and Zed 3rd', $q$select count(*) from public.securitas_board('month', '2026-10-01') where (first_name, overall_rank) in (('Sue', 2), ('Zed', 3))$q$, 2);
select t.eq('the company board still ranks Sam below the Dealer A reps', $q$select count(*) from public.board('month', '2026-10-01') where first_name = 'Sam' and rmr_rank = 4$q$, 1);
select t.eq('year to date adds September: Sam 350 RMR', $q$select count(*) from public.securitas_board('ytd', '2026-10-01') where first_name = 'Sam' and rmr = 350$q$, 1);
select t.eq('a month not yet finalized shows nothing', $q$select count(*) from public.securitas_board('month', '2026-11-01')$q$, 0);
select t.as_owner();

select t.as_user('f0000000-0000-0000-0000-000000000003');
select t.eq('a rep at another dealership gets nothing', $q$select count(*) from public.securitas_board('month', '2026-10-01')$q$, 0);
select t.eq('and nothing year to date either', $q$select count(*) from public.securitas_board('ytd', '2026-10-01')$q$, 0);
select t.as_owner();

select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('the super admin can preview a month still open', $q$select (count(*) = 3)::int from public.securitas_board('month', '2026-11-01')$q$, 1);
select t.as_owner();
rollback;
