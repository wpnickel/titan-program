begin;
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test');
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Dealership A');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', false, false, true, false);
delete from public.months where month_start > '2026-09-01';
insert into public.months (month_start, status) values ('2026-10-01', 'open'), ('2026-11-01', 'open');

select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.start_audit('2026-10-01');
select t.throws('a reason is required', $q$select public.cancel_audit('2026-10-01', ' ')$q$);
select t.throws('only a month in audit can be returned to open', $q$select public.cancel_audit('2026-11-01', 'oops')$q$);
select public.cancel_audit('2026-10-01', 'Pressed by mistake');
select t.as_owner();
select t.eq('the month is open again', $q$select count(*) from public.months where month_start = '2026-10-01' and status = 'open' and audit_started_at is null$q$, 1);
select t.eq('the month that auto-opened stays open', $q$select count(*) from public.months where month_start = '2026-12-01' and status = 'open'$q$, 1);
select t.eq('the reason is in the audit log', $q$select count(*) from public.audit_log where action = 'CANCEL_AUDIT' and new_row ->> 'reason' = 'Pressed by mistake'$q$, 1);
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.throws('a team admin cannot return a month to open', $q$select public.cancel_audit('2026-10-01', 'x')$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.start_audit('2026-10-01');
select public.finalize_month('2026-10-01');
select public.start_audit('2026-11-01');
select t.throws('cannot return an earlier month once a later one is audited', $q$select public.cancel_audit('2026-10-01', 'x')$q$);
select t.as_owner();
rollback;
