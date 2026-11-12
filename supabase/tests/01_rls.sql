begin;

-- Fixtures -----------------------------------------------------------------
insert into public.dealerships (id, name) values
  ('a0000000-0000-0000-0000-00000000000a', 'Dealership A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Dealership B'),
  ('c0000000-0000-0000-0000-00000000000c', 'Dealership C');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1'),
  ('11111111-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Al', 'A2'),
  ('11111111-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'Bo', 'B1'),
  ('11111111-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-00000000000c', 'Cy', 'C1');
insert into auth.users (id, email) select ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'u' || g || '@test' from generate_series(1, 7) g;

-- 1 admin, 2 owner A (dealership scope), 3 multi-dealership owner (A+B), 4 salesperson A1 (own),
-- 5 salesperson A2 (own), 6 team admin A, 7 deactivated owner A
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_report, active) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Owner', 'A', 'manager_owner', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, true, true),
  ('f0000000-0000-0000-0000-000000000003', 'u3@test', 'Multi', 'Owner', 'manager_owner', 'assigned', null, null, false, true, true),
  ('f0000000-0000-0000-0000-000000000004', 'u4@test', 'Ann', 'A1', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', true, false, true),
  ('f0000000-0000-0000-0000-000000000005', 'u5@test', 'Al', 'A2', 'salesperson_enters', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', true, false, true),
  ('f0000000-0000-0000-0000-000000000006', 'u6@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, true),
  ('f0000000-0000-0000-0000-000000000007', 'u7@test', 'Gone', 'Owner', 'manager_owner', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, true, false);
insert into public.profile_dealerships values
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b');
insert into public.months (month_start) values ('2026-10-01'), ('2026-11-01') on conflict do nothing;

-- Signed-out visitors ---------------------------------------------------------
select t.as_anon();
select t.throws('anon cannot read dealerships', 'select * from public.dealerships');
select t.throws('anon cannot read reps', 'select * from public.reps');
select t.throws('anon cannot read profiles', 'select * from public.profiles');
select t.as_owner();

-- Reps: who sees what -----------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('super admin sees all reps', 'select count(*) from public.reps', 4);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000004');
select t.eq('salesperson sees only own rep', 'select count(*) from public.reps', 1);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('dealership owner sees own dealership reps', 'select count(*) from public.reps', 2);
select t.eq('dealership owner cannot see other dealership reps', $q$select count(*) from public.reps where dealership_id <> 'a0000000-0000-0000-0000-00000000000a'$q$, 0);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000003');
select t.eq('multi-dealership owner sees A and B reps', 'select count(*) from public.reps', 3);
select t.eq('multi-dealership owner cannot see C', $q$select count(*) from public.reps where dealership_id = 'c0000000-0000-0000-0000-00000000000c'$q$, 0);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000007');
select t.eq('deactivated user sees no reps', 'select count(*) from public.reps', 0);
select t.as_owner();

-- Dealership names are visible to everyone signed in (leaderboards show them) ------------
select t.as_user('f0000000-0000-0000-0000-000000000004');
select t.eq('any signed-in user reads dealership names', 'select count(*) from public.dealerships', 3);

-- Profiles --------------------------------------------------------------------------
select t.eq('user sees only own profile', 'select count(*) from public.profiles', 1);
select t.eq('user cannot promote self', $q$with u as (update public.profiles set preset = 'super_admin', scope = 'all' where id = auth.uid() returning 1) select count(*) from u$q$, 0);
select t.throws('user cannot create profiles', $q$insert into public.profiles (id, email, first_name, last_name, preset, scope) values ('f0000000-0000-0000-0000-000000000099', 'x@test', 'X', 'X', 'super_admin', 'all')$q$);
select t.eq('user cannot edit dealerships', $q$with u as (update public.dealerships set name = 'Hacked' returning 1) select count(*) from u$q$, 0);
select t.eq('user cannot edit months', $q$with u as (update public.months set status = 'finalized' returning 1) select count(*) from u$q$, 0);
select t.eq('user cannot read settings', 'select count(*) from public.app_settings', 0);
select t.eq('user cannot read audit log', 'select count(*) from public.audit_log', 0);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('super admin sees all profiles', 'select count(*) from public.profiles', 7);
select t.eq('super admin reads alert address', $q$select count(*) from public.app_settings where key = 'late_entry_alert_email' and value = 'titan@sonitrol.co'$q$, 1);
select t.as_owner();

-- Constraints ----------------------------------------------------------------------
select t.throws('team admin cannot compete', $q$update public.profiles set participates_in_rankings = true, rep_id = '11111111-0000-0000-0000-000000000003' where id = 'f0000000-0000-0000-0000-000000000006'$q$);
select t.throws('team admin cannot get AI search', $q$update public.profiles set can_ai_search = true where id = 'f0000000-0000-0000-0000-000000000006'$q$);
select t.throws('AI export needs AI search', $q$update public.profiles set can_ai_export = true where id = 'f0000000-0000-0000-0000-000000000002'$q$);
select t.throws('competing needs a rep', $q$update public.profiles set participates_in_rankings = true where id = 'f0000000-0000-0000-0000-000000000002'$q$);
select t.throws('super admin must see all', $q$update public.profiles set scope = 'own' where id = 'f0000000-0000-0000-0000-000000000001'$q$);
select t.throws('month must start on the 1st', $q$insert into public.months (month_start) values ('2026-12-15')$q$);

-- Audit log -------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
update public.dealerships set name = 'Dealership A (renamed)' where id = 'a0000000-0000-0000-0000-00000000000a';
select t.eq('audit log records the change with who made it', $q$select count(*) from public.audit_log where table_name = 'dealerships' and action = 'UPDATE' and actor_id = 'f0000000-0000-0000-0000-000000000001' and new_row ->> 'name' = 'Dealership A (renamed)' and old_row ->> 'name' = 'Dealership A'$q$, 1);
select t.eq('super admin can read the audit log', 'select count(*) from public.audit_log where table_name = $$profiles$$', 7);
select t.eq('audit log cannot be edited by super admin', $q$with u as (update public.audit_log set action = 'X' returning 1) select count(*) from u$q$, 0);
select t.eq('audit log cannot be deleted by super admin', $q$with d as (delete from public.audit_log returning 1) select count(*) from d$q$, 0);
select t.as_owner();
select t.throws('audit log is append-only even for the database owner', 'delete from public.audit_log');
select t.throws('audit log edits blocked for the database owner', $q$update public.audit_log set action = 'X'$q$);

rollback;
