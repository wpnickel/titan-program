begin;
insert into public.dealerships (id, name, is_securitas) values
  ('a0000000-0000-0000-0000-00000000000a', 'Dealer A', false),
  ('b0000000-0000-0000-0000-00000000000b', 'Dealer B', false),
  ('5e000000-0000-0000-0000-000000000005', 'Securitas Dealer', true);
create function t.rep(p_first text, p_dealer uuid) returns uuid language sql as $$
  insert into public.reps (dealership_id, first_name, last_name) values (p_dealer, p_first, 'Test') returning id
$$;
create temp table r (name text primary key, id uuid);
insert into r select 'Ann', t.rep('Ann', 'a0000000-0000-0000-0000-00000000000a');
insert into r select 'Bob', t.rep('Bob', 'a0000000-0000-0000-0000-00000000000a');
insert into r select 'Cy',  t.rep('Cy',  'b0000000-0000-0000-0000-00000000000b');
insert into r select 'Dee', t.rep('Dee', 'b0000000-0000-0000-0000-00000000000b');
insert into r select 'Eve', t.rep('Eve', 'a0000000-0000-0000-0000-00000000000a');
insert into r select 'Zed', t.rep('Zed', 'a0000000-0000-0000-0000-00000000000a');
insert into r select 'Gus', t.rep('Gus', '5e000000-0000-0000-0000-000000000005');
insert into r select 'Hal', t.rep('Hal', '5e000000-0000-0000-0000-000000000005');
insert into r select 'Ivy', t.rep('Ivy', '5e000000-0000-0000-0000-000000000005');
insert into public.reps (dealership_id, first_name, last_name, active) values ('a0000000-0000-0000-0000-00000000000a', 'Gone', 'Test', false);

insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Ann', 'Test', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', (select id from r where name = 'Ann'), true, false, false, false);

delete from public.months;
insert into public.months (month_start, status) values ('2025-03-01', 'finalized'), ('2026-08-01', 'finalized'), ('2026-09-01', 'finalized'), ('2026-10-01', 'open'), ('2026-11-01', 'open');

-- One card with its counted values set directly (the scoring itself is tested in 04).
create function t.card(p_rep text, p_month date, p_rmr numeric, p_inst numeric, p_nl boolean, p_pts int,
                       p_term int default 36, p_type public.customer_type default 'existing', p_submitted boolean default true, p_deleted boolean default false)
returns void language sql as $$
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount,
                                  points, is_new_logo, submitted, deleted_at)
  select r.dealership_id, r.id, p_month, p_month + 3, 'Co ' || gen_random_uuid()::text, p_type, p_term, p_inst, p_rmr, p_pts, p_nl, p_submitted,
         case when p_deleted then now() end
  from public.reps r where r.id = (select x.id from r x where x.name = p_rep)
$$;

create function t.b(p_name text, p_where text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.board(''month'', ''2026-10-01'') where first_name = %L and %s', p_name, p_where) into n;
  return n;
end $$;
create function t.y(p_name text, p_where text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.board(''ytd'', ''2026-10-01'') where first_name = %L and %s', p_name, p_where) into n;
  return n;
end $$;

-- October 2026
select t.card('Ann', '2026-10-01', 1000, 500, true, 4); select t.card('Ann', '2026-10-01', 0, 0, true, 3); select t.card('Ann', '2026-10-01', 0, 0, true, 3);
select t.card('Bob', '2026-10-01', 800, 900, true, 12); select t.card('Bob', '2026-10-01', 0, 0, true, 0);
select t.card('Cy', '2026-10-01', 800, 400, true, 8); select t.card('Cy', '2026-10-01', 0, 0, true, 0);
select t.card('Dee', '2026-10-01', 500, 0, false, 5);
select t.card('Gus', '2026-10-01', 100, 100, true, 1);
select t.card('Hal', '2026-10-01', 100, 100, true, 1);
select t.card('Zed', '2026-10-01', 500, 500, false, 2, 36, 'residential');         -- residential: points only
select t.card('Zed', '2026-10-01', 700, 700, false, 0, 6);                            -- under 12 months: counts toward nothing
select t.card('Zed', '2026-10-01', 5000, 5000, true, 50, 36, 'existing', false);       -- a draft: not counted
select t.card('Zed', '2026-10-01', 5000, 5000, true, 50, 36, 'existing', true, true);   -- deleted: not counted
-- Earlier months that feed the year-to-date board
select t.card('Cy', '2026-09-01', 1000, 2000, true, 20); select t.card('Cy', '2026-09-01', 0, 0, true, 0);
select t.card('Ivy', '2026-08-01', 300, 300, true, 3);
-- A card in an open month never counts toward a board of another month
select t.card('Eve', '2026-11-01', 9999, 9999, true, 99);

select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.start_audit('2026-10-01');
select public.finalize_month('2026-10-01');
select t.as_owner();

-- Monthly board: values, ranks, ties, exclusions -----------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('Ann: values', $q$select t.b('Ann', 'rmr = 1000 and install = 500 and new_logos = 3 and points = 10')$q$, 1);
select t.eq('Ann: ranks 1, 3, 1, 2', $q$select t.b('Ann', 'rmr_rank = 1 and install_rank = 2 and new_logo_rank = 1 and points_rank = 2')$q$, 1);
select t.eq('Bob wins the RMR tie with Cy on points, ranks 2 and 3', $q$select t.b('Bob', 'rmr_rank = 2') + t.b('Cy', 'rmr_rank = 3')$q$, 2);
select t.eq('Bob and Cy tie on new logos; Bob wins on points', $q$select t.b('Bob', 'new_logo_rank = 2') + t.b('Cy', 'new_logo_rank = 3')$q$, 2);
select t.eq('Ann and Bob tie on overall score 6; Ann wins on RMR rank', $q$select t.b('Ann', 'score = 6 and overall_rank = 1') + t.b('Bob', 'score = 6 and overall_rank = 2')$q$, 2);
select t.eq('Cy is third overall', $q$select t.b('Cy', 'score = 12 and overall_rank = 3')$q$, 1);
select t.eq('Gus and Hal are fully tied and share every rank', $q$select t.b('Gus', 'rmr_rank = 5 and install_rank = 4 and new_logo_rank = 4 and overall_rank = 4') + t.b('Hal', 'rmr_rank = 5 and install_rank = 4 and new_logo_rank = 4 and overall_rank = 4')$q$, 2);
select t.eq('zero in a category means no rank there, and none overall', $q$select t.b('Dee', 'rmr_rank = 4 and install_rank is null and new_logo_rank is null and points_rank = 4 and overall_rank is null')$q$, 1);
select t.eq('Zed: residential counts points only; short, draft and deleted cards count for nothing', $q$select t.b('Zed', 'rmr = 0 and install = 0 and new_logos = 0 and points = 2 and rmr_rank is null and points_rank = 5')$q$, 1);
select t.eq('a rep with no cards in the month is listed with no ranks (the open-month card is not counted)', $q$select t.b('Eve', 'rmr = 0 and points = 0 and overall_rank is null')$q$, 1);
select t.eq('an inactive rep with no cards is not listed', $q$select count(*) from public.board('month', '2026-10-01') where first_name = 'Gone'$q$, 0);

-- Supreme Titan: year to date, January through the month, not the sum of monthly ranks ---------
select t.eq('Cy adds September and is first overall year to date', $q$select t.y('Cy', 'rmr = 1800 and install = 2400 and new_logos = 4 and points = 28 and score = 4 and overall_rank = 1')$q$, 1);
select t.eq('year to date ranks: Ann, Bob, then Ivy and the Securitas pair', $q$select t.y('Ann', 'overall_rank = 2') + t.y('Bob', 'overall_rank = 3') + t.y('Ivy', 'overall_rank = 4') + t.y('Gus', 'overall_rank = 5') + t.y('Hal', 'overall_rank = 5')$q$, 5);
select t.eq('year to date does not include another year', $q$select count(*) from public.board('ytd', '2026-10-01') where rmr > 0 and first_name like 'R%'$q$, 0);

-- Cronus Trip ------------------------------------------------------------------------------------
select t.eq('Cronus slot 1 is the Supreme Titan leader', $q$select count(*) from public.cronus_trip('2026-10-01') where slot = 1 and first_name = 'Cy' and reason = 'Supreme Titan #1'$q$, 1);
select t.eq('then the top 2 in RMR, skipping people already picked', $q$select count(*) from public.cronus_trip('2026-10-01') where (slot, first_name, reason) in ((2, 'Ann', 'Top RMR'), (3, 'Bob', 'Top RMR'))$q$, 2);
select t.eq('then Install: the next two not yet picked (Ivy, then Gus on the name tie-break)', $q$select count(*) from public.cronus_trip('2026-10-01') where (slot, first_name, reason) in ((4, 'Ivy', 'Top Install'), (5, 'Gus', 'Top Install'))$q$, 2);
select t.eq('New Logos has only one person left (Hal); a rep with no rank there cannot be picked', $q$select count(*) from public.cronus_trip('2026-10-01') where (slot, first_name, reason) in ((6, 'Hal', 'Top New Logos'))$q$, 1);
select t.eq('Sonitrol points: Dee and Zed, who have no new logo rank but do have a points rank', $q$select count(*) from public.cronus_trip('2026-10-01') where (slot, first_name, reason) in ((7, 'Dee', 'Top Sonitrol points'), (8, 'Zed', 'Top Sonitrol points'))$q$, 2);
select t.eq('with every Securitas rep already picked there is no Securitas slot, so 8 spots are filled', $q$select count(*) from public.cronus_trip('2026-10-01')$q$, 8);
select t.as_owner();

-- Visibility ---------------------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('a salesperson sees every dealership on a finalized board', $q$select count(distinct dealership) from public.board('month', '2026-10-01')$q$, 3);
select t.eq('a salesperson sees nothing for a month still open', $q$select count(*) from public.board('month', '2026-11-01')$q$, 0);
select t.eq('and no Cronus Trip for a month that is not finalized', $q$select count(*) from public.cronus_trip('2026-11-01')$q$, 0);
select t.eq('the latest finalized month is October', $q$select (public.latest_finalized_month() = '2026-10-01')::int$q$, 1);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('the super admin can preview a month that is still open', $q$select (count(*) > 0)::int from public.board('month', '2026-11-01')$q$, 1);
select t.as_owner();

-- Rank history -------------------------------------------------------------------------------------
select t.eq('finalizing October saved its monthly ranks', $q$select count(*) from public.rank_snapshots s join public.reps r on r.id = s.rep_id where s.period = '2026-10-01' and s.period_kind = 'month' and s.category = 'rmr' and r.first_name = 'Ann' and s.rank = 1 and s.value = 1000$q$, 1);
select t.eq('and the year-to-date ranks', $q$select count(*) from public.rank_snapshots s join public.reps r on r.id = s.rep_id where s.period = '2026-10-01' and s.period_kind = 'ytd' and s.category = 'overall' and r.first_name = 'Cy' and s.rank = 1$q$, 1);
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.reopen_month('2026-10-01', 'Fix a card');
select t.as_owner();
select t.eq('reopening October clears its saved ranks', $q$select count(*) from public.rank_snapshots where period = '2026-10-01'$q$, 0);

-- Securitas slot and a full ten spots: 12 reps in March 2025, every category ordered the same way ---------
create temp table g (i int primary key, id uuid);
insert into g select i, t.rep('R' || lpad(i::text, 2, '0'), case when i in (10, 12) then '5e000000-0000-0000-0000-000000000005'::uuid else 'a0000000-0000-0000-0000-00000000000a'::uuid end) from generate_series(1, 12) i;
insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount, points, is_new_logo)
select r.dealership_id, g.id, '2025-03-01', '2025-03-05', 'G ' || g.i || '-' || n, 'existing', 36, 10, 100, 1, true
from g join public.reps r on r.id = g.id cross join lateral generate_series(1, 13 - g.i) n;
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('ten spots: Supreme Titan #1, two each in four categories, and the best Securitas rep', $q$select count(*) from public.cronus_trip('2025-03-01')$q$, 10);
select t.eq('the order is R01, then 2-3 RMR, 4-5 Install, 6-7 New Logos, 8-9 points', $q$select count(*) from public.cronus_trip('2025-03-01') where (slot, first_name) in ((1,'R01'),(2,'R02'),(3,'R03'),(4,'R04'),(5,'R05'),(6,'R06'),(7,'R07'),(8,'R08'),(9,'R09'))$q$, 9);
select t.eq('the last spot is the highest ranked Securitas rep (R10, not R12)', $q$select count(*) from public.cronus_trip('2025-03-01') where slot = 10 and first_name = 'R10' and reason = 'Securitas leader'$q$, 1);
select t.as_owner();
rollback;
