begin;
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-0000000000b1', 'admin@test'),
  ('f0000000-0000-0000-0000-0000000000b2', 'rep@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope) values
  ('f0000000-0000-0000-0000-0000000000b1', 'admin@test', 'A', 'B', 'super_admin', 'all');
insert into public.dealerships (id, name) values ('d0000000-0000-0000-0000-0000000000d1', 'D1');
insert into public.reps (id, dealership_id, first_name, last_name) values ('e0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000d1', 'R', 'S');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings) values
  ('f0000000-0000-0000-0000-0000000000b2', 'rep@test', 'R', 'S', 'salesperson_view', 'own', 'd0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000e1', true);
insert into public.profile_status (profile_id, invited_at) values ('f0000000-0000-0000-0000-0000000000b2', now());

select t.as_user('f0000000-0000-0000-0000-0000000000b1');
select t.eq('super admin reads invite status', 'select count(*) from public.profile_status', 1);
select t.throws('super admin cannot write status from the browser side', $q$update public.profile_status set invited_at = null$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-0000000000b2');
select t.eq('salesperson cannot read invite status', 'select count(*) from public.profile_status', 0);
select t.throws('salesperson cannot write status', $q$insert into public.profile_status (profile_id) values ('f0000000-0000-0000-0000-0000000000b2')$q$);
select t.as_owner();
rollback;
