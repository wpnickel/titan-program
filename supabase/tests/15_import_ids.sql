begin;
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'admin@test'), ('f0000000-0000-0000-0000-000000000002', 'rep@test');
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Existing Co');
insert into public.profiles (id, email, first_name, last_name, preset, scope, can_enter_for_dealership, can_report)
  values ('f0000000-0000-0000-0000-000000000001', 'admin@test', 'Admin', 'One', 'super_admin', 'all', true, true);

-- The super admin imports the way the Import screen does: with their own session.
select t.as_user('f0000000-0000-0000-0000-000000000001');
insert into public.dealerships (name, legacy_id, active) values ('Imported Co', 63, true);
update public.dealerships set legacy_id = 5 where name = 'Existing Co';
insert into public.reps (legacy_id, first_name, last_name, dealership_id, active) select 19561, 'Fred', 'Barrett', id, false from public.dealerships where legacy_id = 63;
insert into public.profiles (id, email, legacy_id, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, active)
  select 'f0000000-0000-0000-0000-000000000002', 'rep@test', 19561, 'Fred', 'Barrett', 'salesperson_view', 'own', d.id, r.id, true, false
  from public.dealerships d, public.reps r where d.legacy_id = 63 and r.legacy_id = 19561;
select t.as_owner();

select t.eq('a dealership is found by its old ID', $q$select count(*) from public.dealerships where legacy_id = 63 and name = 'Imported Co'$q$, 1);
select t.eq('an existing dealership can be linked to its old ID', $q$select count(*) from public.dealerships where legacy_id = 5 and name = 'Existing Co'$q$, 1);
select t.eq('a rep is found by its old ID', $q$select count(*) from public.reps where legacy_id = 19561$q$, 1);
select t.eq('a login is found by its old ID', $q$select count(*) from public.profiles where legacy_id = 19561$q$, 1);
select t.eq('an imported login can be switched off', $q$select count(*) from public.profiles where legacy_id = 19561 and not active$q$, 1);

-- Importing twice must not create a second copy.
select t.throws('a second dealership cannot reuse an old ID', $q$insert into public.dealerships (name, legacy_id) values ('Copy', 63)$q$);
select t.throws('a second rep cannot reuse an old ID', $q$insert into public.reps (legacy_id, first_name, last_name, dealership_id) select 19561, 'Fred', 'Copy', id from public.dealerships limit 1$q$);
insert into public.dealerships (name) values ('Added by hand'), ('Added by hand too');
select t.eq('two hand-added dealerships can both have no old ID', $q$select count(*) from public.dealerships where legacy_id is null$q$, 2);

-- Other users cannot set old IDs.
select t.as_user('f0000000-0000-0000-0000-000000000002');
update public.dealerships set legacy_id = 999 where legacy_id = 63;
select t.as_owner();
select t.eq('a salesperson cannot change a dealership''s old ID', $q$select count(*) from public.dealerships where legacy_id = 999$q$, 0);
rollback;
