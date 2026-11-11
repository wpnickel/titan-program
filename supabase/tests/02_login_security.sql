begin;
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-0000000000a1', 'admin@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope)
  values ('f0000000-0000-0000-0000-0000000000a1', 'admin@test', 'A', 'B', 'super_admin', 'all');
insert into public.login_codes (user_id, code_hash, expires_at)
  values ('f0000000-0000-0000-0000-0000000000a1', 'x', now() + interval '10 minutes');
insert into public.trusted_devices (user_id, token_hash, expires_at)
  values ('f0000000-0000-0000-0000-0000000000a1', 'y', now() + interval '30 days');

select t.as_user('f0000000-0000-0000-0000-0000000000a1');
select t.throws('even a super admin cannot read login codes', 'select * from public.login_codes');
select t.throws('even a super admin cannot read trusted devices', 'select * from public.trusted_devices');
select t.throws('cannot insert login codes', $q$insert into public.login_codes (user_id, code_hash, expires_at) values ('f0000000-0000-0000-0000-0000000000a1', 'z', now())$q$);
select t.as_anon();
select t.throws('signed-out visitors cannot read login codes', 'select * from public.login_codes');
select t.as_owner();
rollback;
