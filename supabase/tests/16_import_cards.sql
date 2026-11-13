begin;
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'admin@test'), ('f0000000-0000-0000-0000-000000000002', 'rep@test');
insert into public.dealerships (id, name, legacy_id) values ('a0000000-0000-0000-0000-00000000000a', 'Dealer A', 63), ('a0000000-0000-0000-0000-00000000000b', 'Dealer B', 64);
insert into public.reps (id, dealership_id, first_name, last_name, legacy_id) values
  ('11111111-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'Rep', 1001),
  ('11111111-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Bo', 'Rep', 1002);
insert into public.profiles (id, email, first_name, last_name, preset, scope, can_enter_for_dealership, can_report)
  values ('f0000000-0000-0000-0000-000000000001', 'admin@test', 'Admin', 'One', 'super_admin', 'all', true, true);
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own)
  values ('f0000000-0000-0000-0000-000000000002', 'rep@test', 'Ann', 'Rep', 'salesperson_enters', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-0000000000a1', true, true);
delete from public.months;

create function t.imp(rows text, mode text) returns jsonb language plpgsql as $$
declare r jsonb; begin perform t.as_user('f0000000-0000-0000-0000-000000000001'); r := public.import_cards(rows::jsonb, mode); perform t.as_owner(); return r; end $$;
create function t.n(r jsonb, k text) returns int language sql as $$ select (r ->> k)::int $$;

-- Recorded history (2023 rules): points and the new-logo flag are stored as the old system recorded them --------
create temp table res1 as select t.imp($q$[
  {"legacy_id":1,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2023-03-01","sale_date":"2023-03-09","business_name":"Old Co","customer_type":"new_logo","term":36,"rmr":400,"install":900,"points":6,"new_logo":true,"products":{"sonitrol_intrusion":1,"audio_sensor":4},"lead_sources":["Cold Call"],"industry":"Retail: High-End","created_at":"2023-03-10 10:00:00","updated_at":"2023-03-10 10:00:00"},
  {"legacy_id":2,"rep_legacy_id":1002,"dealership_legacy_id":63,"entry_month":"2023-03-01","sale_date":"2023-03-02","business_name":"Gone Co","customer_type":"existing","term":24,"rmr":50,"install":0,"points":1,"new_logo":false,"deleted":true,"products":{},"updated_at":"2023-04-01 10:00:00"},
  {"legacy_id":4,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2023-03-01","sale_date":"2023-02-27","business_name":"Late Co","customer_type":"existing","term":24,"rmr":50,"install":0,"points":0,"new_logo":false,"industry":"Airport"},
  {"legacy_id":3,"rep_legacy_id":9999,"dealership_legacy_id":63,"entry_month":"2023-03-01","sale_date":"2023-03-02","business_name":"No Rep Co","customer_type":"existing","term":24,"rmr":50,"install":0}
]$q$, 'recorded') as r;
select t.eq('three recorded cards went in', $q$select t.n(r, 'inserted') from res1$q$, 3);
select t.eq('a card for an unknown person is reported, not loaded', $q$select jsonb_array_length(r -> 'errors') from res1$q$, 1);
select t.eq('recorded points are kept exactly (double points for a new logo)', $q$select count(*) from public.tally_cards where legacy_id = 1 and points = 6 and is_new_logo$q$, 1);
select t.eq('the products and lead source came across', $q$select (select count(*) from public.tally_card_products p join public.tally_cards c on c.id = p.card_id where c.legacy_id = 1) * 10 + (select count(*) from public.tally_card_lead_sources l join public.tally_cards c on c.id = l.card_id where c.legacy_id = 1)$q$, 21);
select t.eq('a deleted old card is imported as deleted', $q$select count(*) from public.tally_cards where legacy_id = 2 and deleted_at is not null$q$, 1);
select t.eq('the old created date is kept', $q$select count(*) from public.tally_cards where legacy_id = 1 and created_at = '2023-03-10 10:00:00'$q$, 1);
select t.eq('recorded months are locked and history only', $q$select count(*) from public.months where month_start = '2023-03-01' and status = 'finalized' and history_only$q$, 1);
select t.eq('a sale dated before its entry month is marked late, with no alert', $q$select count(*) from public.tally_cards where is_late_entry and legacy_id = 4$q$, 1);
select t.eq('only that card is marked late', $q$select count(*) from public.tally_cards where is_late_entry$q$, 1);
select t.eq('an industry the new form lacks is added, hidden from the form', $q$select count(*) from public.industries where name = 'Airport' and not active$q$, 1);
select t.eq('imported cards raise no alerts', $q$select count(*) from public.alerts$q$, 0);
select t.eq('imports write one summary row, not one per card', $q$select count(*) from public.audit_log where table_name = 'tally_cards'$q$, 1);
select t.eq('history does not become the latest month', $q$select count(*) from (select public.latest_finalized_month() m) x where m is null$q$, 1);

-- Importing again adds nothing ------------------------------------------------------------------------------
create temp table res2 as select t.imp($q$[{"legacy_id":1,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2023-03-01","sale_date":"2023-03-09","business_name":"Old Co","customer_type":"new_logo","term":36,"rmr":400,"install":900,"points":6,"new_logo":true}]$q$, 'recorded') as r;
select t.eq('a repeat is skipped', $q$select t.n(r, 'skipped') * 10 + t.n(r, 'inserted') from res2$q$, 10);

-- Calculated cards (current rules) -------------------------------------------------------------------------------
create temp table res3 as select t.imp($q$[
  {"legacy_id":10,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2026-01-01","sale_date":"2026-01-10","business_name":"Acme Corp","customer_type":"new_logo","term":36,"rmr":100,"install":500,"old_points":2,"products":{"sonitrol_intrusion":1,"audio_sensor":2,"verified_video":1}},
  {"legacy_id":11,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2026-02-01","sale_date":"2026-02-10","business_name":"ACME corp.","customer_type":"new_logo","term":36,"rmr":100,"install":500,"old_points":2,"products":{"sonitrol_intrusion":1,"audio_sensor":1,"verified_video":1}},
  {"legacy_id":12,"rep_legacy_id":1002,"dealership_legacy_id":63,"entry_month":"2026-01-01","sale_date":"2026-01-12","business_name":"Handmade Inc","customer_type":"existing","term":24,"rmr":80,"install":0,"old_points":3,"products":{"verified_video":1}},
  {"legacy_id":13,"rep_legacy_id":1002,"dealership_legacy_id":63,"entry_month":"2026-01-01","sale_date":"2026-01-15","business_name":"Short Co","customer_type":"existing","term":6,"rmr":80,"install":0,"old_points":0,"products":{"verified_video":1}},
  {"legacy_id":14,"rep_legacy_id":1001,"dealership_legacy_id":63,"entry_month":"2026-01-01","sale_date":"2026-01-20","business_name":"Old Co","customer_type":"new_logo","term":36,"rmr":400,"install":900,"old_points":1,"products":{"verified_video":1}}
]$q$, 'calculate') as r;
select t.eq('five calculated cards went in', $q$select t.n(r, 'inserted') from res3$q$, 5);
select t.eq('points follow the rules: intrusion with audio sensor plus video = 2', $q$select count(*) from public.tally_cards where legacy_id = 10 and points = 2$q$, 1);
select t.eq('the first card for a company is the new logo', $q$select count(*) from public.tally_cards where legacy_id = 10 and is_new_logo$q$, 1);
select t.eq('a later card for the same company (name spelled differently) is not', $q$select count(*) from public.tally_cards where legacy_id = 11 and not is_new_logo$q$, 1);
select t.eq('an old hand adjustment is kept as an override with a reason', $q$select count(*) from public.card_audit a join public.tally_cards c on c.id = a.card_id where c.legacy_id = 12 and a.points_override = 3 and c.points = 3 and a.reason like 'Imported:%'$q$, 1);
select t.eq('only the differing card got an override', $q$select count(*) from public.card_audit$q$, 1);
select t.eq('a contract under 12 months scores nothing', $q$select count(*) from public.tally_cards where legacy_id = 13 and points = 0$q$, 1);
select t.eq('a company already in earlier history is not a new logo, even in 2026', $q$select count(*) from public.tally_cards where legacy_id = 14 and not is_new_logo$q$, 1);
select t.eq('the two-point difference on 14 is kept as an override too', $q$select count(*) from public.tally_cards where legacy_id = 14 and points = 1$q$, 1);
select t.eq('calculated months stay open until finalized', $q$select count(*) from public.months where month_start in ('2026-01-01', '2026-02-01') and status = 'open' and not history_only$q$, 2);
select t.eq('recorded history is untouched by recalculation', $q$select count(*) from public.tally_cards where legacy_id = 1 and points = 6$q$, 1);

-- Locking the months and saving the rankings -----------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000001');
select t.eq('two months finalized', $q$select public.import_finalize_months('2026-02-01')$q$, 2);
select t.as_owner();
select t.eq('they are finalized with their rankings saved', $q$select count(*) from public.months where month_start in ('2026-01-01', '2026-02-01') and status = 'finalized' and tiebreak_order is not null$q$, 2);
select t.eq('rank snapshots exist for them', $q$select (count(*) > 0)::int from public.rank_snapshots where period = '2026-01-01'$q$, 1);
select t.eq('the latest month is now January or later', $q$select count(*) from (select public.latest_finalized_month() m) x where m = '2026-02-01'$q$, 1);
create function t.queue_missing_pdf() returns int language plpgsql as $$
declare n int; begin perform t.as_user('f0000000-0000-0000-0000-000000000001');
  select count(*) into n from public.audit_queue('2026-01-01') where 'missing_pdf' = any (reasons); perform t.as_owner(); return n; end $$;
select t.eq('imported cards are not flagged for a missing PDF', $q$select t.queue_missing_pdf()$q$, 0);

-- Only the super admin can import ------------------------------------------------------------------------------
select t.as_user('f0000000-0000-0000-0000-000000000002');
select t.throws('a salesperson cannot import', $q$select public.import_cards('[]'::jsonb, 'recorded')$q$);
select t.throws('a salesperson cannot finalize imported months', $q$select public.import_finalize_months('2026-12-01')$q$);
select t.as_owner();
rollback;
