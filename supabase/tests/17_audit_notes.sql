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
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.start_audit('2026-10-01');
select t.as_owner();

-- Saving notes without approving ------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.throws('a team admin cannot save audit notes', $q$select public.audit_save_notes(t.cid('newlogo'), 'x', true)$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.throws('holding a card needs a note', $q$select public.audit_save_notes(t.cid('newlogo'), '   ', true)$q$);
select public.audit_save_notes(t.cid('newlogo'), 'Waiting for the signed contract from the dealer', true);
select t.eq('the card is now waiting for information', $q$select count(*) from public.audit_queue('2026-10-01') where business_name = 'Riverside Dental' and audit_status = 'on_hold' and notes like 'Waiting for the signed%'$q$, 1);
select t.eq('a waiting card is not counted as reviewed', $q$select reviewed from public.audit_months() where month_start = '2026-10-01'$q$, 0);
select t.eq('the month shows one card waiting', $q$select on_hold from public.audit_months() where month_start = '2026-10-01'$q$, 1);
select t.eq('a waiting card does not change its points or new-logo result', $q$select is_new_logo::int from public.tally_cards where id = t.cid('newlogo')$q$, 1);
select public.audit_save_notes(t.cid('newlogo'), 'Contract arrives Friday', true);
select t.eq('saving again replaces the note', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and notes = 'Contract arrives Friday' and status = 'on_hold'$q$, 1);
select t.eq('the activity panel shows the hold and the note', $q$select count(*) from public.card_activity(t.cid('newlogo')) where what like 'Audit: waiting for information. Contract arrives Friday'$q$, 1);

-- Approving later keeps the notes -----------------------------------------------------------------------
select public.audit_approve(t.cid('newlogo'));
select t.eq('approving a waiting card approves it and keeps the note', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'approved' and notes = 'Contract arrives Friday'$q$, 1);
select t.eq('it now counts as reviewed and nothing is waiting', $q$select reviewed * 10 + on_hold from public.audit_months() where month_start = '2026-10-01'$q$, 10);

-- Notes on a reviewed card keep its status, unless it is sent back --------------------------------------
select public.audit_save_notes(t.cid('newlogo'), 'Contract checked, matches', false);
select t.eq('a note on an approved card leaves it approved', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'approved' and notes = 'Contract checked, matches'$q$, 1);
select public.audit_save_notes(t.cid('newlogo'), 'Dealer changed the term, need the addendum', true);
select t.eq('an approved card can be sent back to waiting', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'on_hold'$q$, 1);

-- Adjusting a waiting card adjusts it and keeps the note ------------------------------------------------
select public.audit_adjust(jsonb_build_object('card_id', t.cid('newlogo'), 'points', 5, 'reason', 'Bundle'));
select t.eq('an adjustment replaces the waiting state and keeps the note', $q$select count(*) from public.card_audit where card_id = t.cid('newlogo') and status = 'adjusted' and notes like 'Dealer changed%'$q$, 1);

-- Releasing a hold --------------------------------------------------------------------------------------
select public.audit_save_notes(t.cid('short'), 'Need the customer letter', true);
select public.audit_save_notes(t.cid('short'), '', false);
select t.eq('clearing the note of a waiting card releases it', $q$select count(*) from public.audit_queue('2026-10-01') where business_name = 'Short Co' and audit_status = 'unreviewed' and notes is null$q$, 1);
select public.audit_save_notes(t.cid('plain'), '', false);
select t.eq('an empty note on an untouched card does nothing', $q$select count(*) from public.card_audit where card_id = t.cid('plain')$q$, 0);

-- Waiting cards still warn at finalize time (they count as not reviewed) ------------------------------
select public.audit_save_notes(t.cid('resi'), 'Waiting for PDF', true);
select t.eq('cards left to audit still include waiting cards', $q$select flagged - reviewed from public.audit_months() where month_start = '2026-10-01'$q$, 4);
select t.as_owner();

-- Finalized months are locked ---------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select public.finalize_month('2026-10-01');
select t.throws('notes cannot be changed once the month is finalized', $q$select public.audit_save_notes(t.cid('late'), 'x', true)$q$);
select t.as_owner();
