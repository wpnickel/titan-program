begin;
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Dealer A');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Xavier', 'Test'),
  ('11111111-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'Yolanda', 'Test');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, true, false);
delete from public.months;
insert into public.months (month_start, status) values ('2026-09-01', 'finalized'), ('2026-10-01', 'open'), ('2026-11-01', 'open');

-- Xavier and Yolanda tie on RMR (500). Xavier has more new logos; Yolanda has more install.
create function t.card(p_rep uuid, p_month date, p_rmr numeric, p_inst numeric, p_nl boolean, p_pts int) returns void language sql as $$
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount, points, is_new_logo)
  values ('a0000000-0000-0000-0000-00000000000a', p_rep, p_month, p_month + 3, 'Co ' || gen_random_uuid()::text, 'existing', 36, p_inst, p_rmr, p_pts, p_nl)
$$;
create function t.setup(p_month date) returns void language plpgsql as $$
begin
  perform t.card('11111111-0000-0000-0000-00000000000a', p_month, 500, 100, true, 3);
  perform t.card('11111111-0000-0000-0000-00000000000a', p_month, 0, 0, true, 2);
  perform t.card('11111111-0000-0000-0000-00000000000b', p_month, 500, 900, true, 5);
end $$;
select t.setup('2026-10-01'); select t.setup('2026-11-01');
create function t.first_rmr(p_month date) returns text language sql as $$
  select first_name from public.board('month', p_month) where rmr_rank = 1
$$;
create function t.rmr_first_is(p_month date, p_name text) returns bigint language sql as $$
  select count(*) from public.board('month', p_month) where rmr_rank = 1 and first_name = p_name
$$;

select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('default order is RMR, new logos, points, install', $q$select (public.get_tiebreak_order() = array['rmr','new_logos','points','install'])::int$q$, 1);
select t.eq('by default the RMR tie goes to the rep with more new logos', $q$select t.rmr_first_is('2026-10-01', 'Xavier')$q$, 1);

select public.save_tiebreak_order(array['install', 'rmr', 'new_logos', 'points']);
select t.eq('with install first, the RMR tie goes to the rep with more install', $q$select t.rmr_first_is('2026-10-01', 'Yolanda')$q$, 1);
select t.eq('the new order is read back', $q$select (public.get_tiebreak_order() = array['install','rmr','new_logos','points'])::int$q$, 1);
select t.as_owner();
select t.eq('the change is in the audit log (as owner)', $q$select count(*) from public.audit_log where table_name = 'app_settings' and (new_row ->> 'value') = 'install,rmr,new_logos,points'$q$, 1);

select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.throws('every category must be listed once (3 given)', $q$select public.save_tiebreak_order(array['rmr', 'install', 'points'])$q$);
select t.throws('every category must be listed once (duplicate)', $q$select public.save_tiebreak_order(array['rmr', 'rmr', 'points', 'install'])$q$);
select t.throws('unknown categories are refused', $q$select public.save_tiebreak_order(array['rmr', 'install', 'points', 'bonus'])$q$);
select public.save_tiebreak_order(array['rmr', 'new_logos', 'points', 'install']);

-- A finalized month keeps the order it was finalized with ------------------------------------------
select public.start_audit('2026-10-01');
select public.finalize_month('2026-10-01');
select t.eq('October kept the order in force when it was finalized', $q$select count(*) from public.months where month_start = '2026-10-01' and tiebreak_order = 'rmr,new_logos,points,install'$q$, 1);
select public.save_tiebreak_order(array['install', 'rmr', 'new_logos', 'points']);
select t.eq('changing the rules does not re-rank finalized October', $q$select t.rmr_first_is('2026-10-01', 'Xavier')$q$, 1);
select t.eq('but a month not yet finalized uses the new order', $q$select t.rmr_first_is('2026-11-01', 'Yolanda')$q$, 1);
select t.eq('saved October ranks follow the order it was finalized with', $q$select count(*) from public.rank_snapshots s join public.reps r on r.id = s.rep_id where s.period = '2026-10-01' and s.period_kind = 'month' and s.category = 'rmr' and s.rank = 1 and r.first_name = 'Xavier'$q$, 1);

select public.reopen_month('2026-10-01', 'Check the rules');
select t.eq('reopening clears the saved order', $q$select count(*) from public.months where month_start = '2026-10-01' and tiebreak_order is null$q$, 1);
select t.eq('and October follows the current order until it is finalized again', $q$select t.rmr_first_is('2026-10-01', 'Yolanda')$q$, 1);
select t.as_owner();

select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.throws('a team admin cannot change the order', $q$select public.save_tiebreak_order(array['rmr', 'install', 'new_logos', 'points'])$q$);
select t.eq('and cannot read it', $q$select (public.get_tiebreak_order() is null)::int$q$, 1);
select t.as_owner();
rollback;
