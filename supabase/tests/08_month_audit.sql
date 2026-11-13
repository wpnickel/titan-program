begin;
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Dealership A');
insert into public.reps (id, dealership_id, first_name, last_name) values ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'u1@test'), ('f0000000-0000-0000-0000-000000000002', 'u2@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, true, false);
delete from public.months where month_start > '2026-09-01';
insert into public.months (month_start, status) values ('2026-10-01', 'open'), ('2026-11-01', 'open');

create function t.mk(p_name text, p_type text, p_term int, p_month date, p_product text default 's1000', p_sale date default null, p_rmr numeric default 100, p_install numeric default 500) returns uuid language plpgsql as $$
declare cid uuid;
begin
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, term_months, install_amount, rmr_amount, is_late_entry, submitted)
  values ('a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', p_month, coalesce(p_sale, p_month + 2), p_name, p_type::public.customer_type, p_term, p_install, p_rmr, coalesce(p_sale, p_month + 2) < p_month, true)
  returning id into cid;
  insert into public.tally_card_products (card_id, product_id, quantity) select cid, id, 1 from public.products where key = p_product;
  perform app.refresh_card_score(cid);
  return cid;
end $$;
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids select 'newlogo', t.mk('Riverside Dental', 'new_logo', 36, '2026-10-01');
insert into ids select 'short', t.mk('Short Co', 'existing', 6, '2026-10-01');
insert into ids select 'plain', t.mk('Plain Co', 'existing', 36, '2026-10-01');
insert into ids select 'resi', t.mk('Home Owner', 'residential', 36, '2026-10-01');
insert into ids select 'late', t.mk('Late Co', 'existing', 36, '2026-10-01', p_sale => '2026-09-15');
create function t.cid(n text) returns uuid language sql as $$ select id from ids where name = n $$;

-- Only the super admin can use the audit button ----------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.throws('a team admin cannot start an audit', $q$select public.start_audit('2026-10-01')$q$);
select t.throws('a team admin cannot read the queue', $q$select * from public.audit_queue('2026-10-01')$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.throws('months must be audited in order', $q$select public.start_audit('2026-11-01')$q$);
select public.start_audit('2026-10-01');
select t.as_owner();
select t.eq('October is now in audit', $q$select count(*) from public.months where month_start = '2026-10-01' and status = 'in_audit' and audit_started_at is not null$q$, 1);
select t.eq('November stays open', $q$select count(*) from public.months where month_start = '2026-11-01' and status = 'open'$q$, 1);
select t.eq('December opens when October is audited', $q$select count(*) from public.months where month_start = '2026-12-01' and status = 'open'$q$, 1);
select t.throws('a month already in audit cannot be audited again', $q$select public.start_audit('2026-10-01') from t.as_user('f0000000-0000-0000-0000-000000000001')$q$);
select t.as_owner();
select t.eq('dealership staff can no longer enter in October', $q$select (select app.month_allows_entry('2026-10-01') from t.as_user('f0000000-0000-0000-0000-000000000002'))::int$q$, 0);
select t.as_owner();

-- Queue -----------------------------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('queue holds every submitted card', $q$select count(*) from public.audit_queue('2026-10-01')$q$, 5);
select t.eq('plain cards are queued with no tags', $q$select count(*) from public.audit_queue('2026-10-01') where business_name = 'Plain Co' and cardinality(reasons) = 0$q$, 1);
select t.eq('new logos are queued as new logos', $q$select count(*) from public.audit_queue('2026-10-01') where business_name = 'Riverside Dental' and 'new_logo' = any (reasons)$q$, 1);
select t.eq('short contracts are queued', $q$select count(*) from public.audit_queue('2026-10-01') where 'under_12' = any (reasons)$q$, 1);
select t.eq('late sales are queued', $q$select count(*) from public.audit_queue('2026-10-01') where 'late_entry' = any (reasons)$q$, 1);
select t.eq('residential without a PDF is queued for both reasons', $q$select count(*) from public.audit_queue('2026-10-01') where 'residential' = any (reasons) and 'missing_pdf' = any (reasons)$q$, 1);
select t.eq('everything starts Unreviewed', $q$select count(*) from public.audit_queue('2026-10-01') where audit_status = 'unreviewed'$q$, 5);

-- Review ---------------------------------------------------------------------------------------------
select public.audit_approve(t.cid('short'));
select t.eq('approving marks the card Approved', $q$select count(*) from public.audit_queue('2026-10-01') where business_name = 'Short Co' and audit_status = 'approved'$q$, 1);
select t.throws('an adjustment needs a reason', $q$select public.audit_adjust(jsonb_build_object('card_id', t.cid('newlogo'), 'new_logo', false))$q$);
select public.audit_adjust(jsonb_build_object('card_id', t.cid('newlogo'), 'new_logo', false, 'reason', 'Same practice as an existing customer'));
select t.eq('forcing not-a-new-logo takes effect', $q$select is_new_logo::int from public.tally_cards where id = t.cid('newlogo')$q$, 0);
select t.eq('the card is marked Adjusted with the reason', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'adjusted' and reason like 'Same practice%'$q$, 1);
select public.audit_adjust(jsonb_build_object('card_id', t.cid('newlogo'), 'new_logo', 'auto', 'reason', 'Checked again: it is new'));
select t.eq('auto goes back to the rules', $q$select is_new_logo::int from public.tally_cards where id = t.cid('newlogo')$q$, 1);
select public.audit_adjust(jsonb_build_object('card_id', t.cid('newlogo'), 'points', 5, 'reason', 'Bundle'));
select t.eq('a points override replaces the calculated points', $q$select points from public.tally_cards where id = t.cid('newlogo')$q$, 5);
select public.audit_adjust(jsonb_build_object('card_id', t.cid('plain'), 'customer_type', 'residential', 'reason', 'Home office'));
select t.eq('the customer type can be changed', $q$select count(*) from public.tally_cards where id = t.cid('plain') and customer_type = 'residential'$q$, 1);
select public.audit_approve(t.cid('newlogo'));
select t.eq('approving an adjusted card keeps it Adjusted', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'adjusted'$q$, 1);
select t.eq('the audit log records the adjustment', $q$select count(*) from public.audit_log where table_name = 'card_audit' and row_key = t.cid('newlogo')::text$q$, 3);
select t.eq('the card activity lists the audit steps', $q$select count(*) from public.card_activity(t.cid('newlogo')) where what like 'Audit:%'$q$, 3);
select t.eq('month summary counts the queue', $q$select flagged from public.audit_months() where month_start = '2026-10-01'$q$, 5);
select t.as_owner();

-- Late alerts ---------------------------------------------------------------------------------------------
select t.eq('a late sale raised one alert', $q$select count(*) from public.alerts where kind = 'late_entry' and card_id = t.cid('late')$q$, 1);
select t.eq('the alert names the business', $q$select count(*) from public.alerts where message like 'Late sale: Late Co%'$q$, 1);
select t.eq('a normal card raises no alert', $q$select count(*) from public.alerts where card_id = t.cid('short')$q$, 0);
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.eq('dealership staff cannot read alerts', 'select count(*) from public.alerts', 0);
select t.eq('dealership staff cannot read audit status', 'select count(*) from public.card_audit', 0);
select t.as_owner();

-- Finalize and reopen ------------------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.finalize_month('2026-10-01');
select t.as_owner();
select t.eq('October is finalized', $q$select count(*) from public.months where month_start = '2026-10-01' and status = 'finalized' and finalized_at is not null$q$, 1);
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.throws('a finalized month cannot be adjusted', $q$select public.audit_adjust(jsonb_build_object('card_id', t.cid('short'), 'points', 3, 'reason', 'x'))$q$);
select t.eq('not even the super admin can enter in a finalized month', $q$select app.month_allows_entry('2026-10-01')::int$q$, 0);
select t.throws('only a month in audit can be finalized', $q$select public.finalize_month('2026-11-01')$q$);
select t.throws('reopening needs a reason', $q$select public.reopen_month('2026-10-01', '  ')$q$);
select public.reopen_month('2026-10-01', 'Missed a late contract');
select t.as_owner();
select t.eq('reopened month is back in audit', $q$select count(*) from public.months where month_start = '2026-10-01' and status = 'in_audit' and finalized_at is null$q$, 1);
select t.eq('the reopen reason is in the audit log', $q$select count(*) from public.audit_log where action = 'REOPEN' and new_row ->> 'reason' = 'Missed a late contract'$q$, 1);
rollback;
