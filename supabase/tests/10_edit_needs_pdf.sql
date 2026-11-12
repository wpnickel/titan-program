begin;
insert into public.dealerships (id, name) values ('a0000000-0000-0000-0000-00000000000a', 'Dealership A');
insert into public.reps (id, dealership_id, first_name, last_name) values ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1');
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000004', 'u4@test');
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000004', 'u4@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', false, false, true, false);
insert into public.months (month_start, status) values ('2026-10-01', 'open') on conflict do nothing;

create function t.card(p_type text, p_id uuid default null) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'rep_id', '11111111-0000-0000-0000-000000000001', 'business_name', 'Edit Test Co', 'entry_month', '2026-10-01',
    'sale_date', '2026-10-05', 'customer_type', p_type, 'term_months', 36, 'install_amount', 500, 'rmr_amount', 100)
$$;
create function t.save_as(j jsonb) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform t.as_user('f0000000-0000-0000-0000-000000000004');
  r := public.save_tally_card(j);
  perform t.as_owner();
  return r;
exception when others then perform t.as_owner(); raise;
end $$;

-- An existing-customer card, submitted (no PDF needed).
create temp table c as select t.save_as(t.card('existing')) as id;
update public.tally_cards set submitted = true where id = (select id from c);

select t.throws('editing a submitted card into a new logo needs a PDF', format($q$select t.save_as(t.card('new_logo', %L))$q$, (select id from c)));
select t.throws('editing a submitted card into residential needs a PDF', format($q$select t.save_as(t.card('residential', %L))$q$, (select id from c)));
select t.eq('the failed edit changed nothing', format($q$select count(*) from public.tally_cards where id = %L and customer_type = 'existing'$q$, (select id from c)), 1);

insert into public.tally_card_files (card_id, storage_path, file_name, size_bytes) select id, 'x/y.pdf', 'y.pdf', 1000 from c;
select t.eq('with a PDF on the card the edit saves', format($q$select (t.save_as(t.card('new_logo', %L)) is not null)::int$q$, (select id from c)), 1);
select t.eq('and it is a new logo now', format($q$select count(*) from public.tally_cards where id = %L and customer_type = 'new_logo'$q$, (select id from c)), 1);

-- A draft can still be changed to a new logo without a PDF; the PDF is checked when it is submitted.
create temp table d as select t.save_as(t.card('existing')) as id;
select t.eq('a draft can become a new logo without a PDF', format($q$select (t.save_as(t.card('new_logo', %L)) is not null)::int$q$, (select id from d)), 1);

-- An old submitted new-logo card without a PDF can still be corrected.
create temp table o as select t.save_as(t.card('new_logo')) as id;
update public.tally_cards set submitted = true where id = (select id from o);
select t.eq('a card that already needed a PDF can still be corrected', format($q$select (t.save_as(jsonb_set(t.card('new_logo', %L), '{business_name}', '"Edit Test Co 2"')) is not null)::int$q$, (select id from o)), 1);

-- The last PDF of a submitted card that needs one cannot be removed; one of two can.
create function t.remove_as(f uuid) returns text language plpgsql as $$
declare r text;
begin
  perform t.as_user('f0000000-0000-0000-0000-000000000004');
  r := public.remove_card_file(f);
  perform t.as_owner();
  return r;
exception when others then perform t.as_owner(); raise;
end $$;
insert into public.tally_card_files (card_id, storage_path, file_name, size_bytes) select id, 'x/z.pdf', 'z.pdf', 1000 from c;
select t.eq('one of two PDFs can be removed', format($q$select (t.remove_as(id) is not null)::int from public.tally_card_files where card_id = %L and file_name = 'z.pdf'$q$, (select id from c)), 1);
select t.throws('the last PDF cannot be removed', format($q$select t.remove_as(id) from public.tally_card_files where card_id = %L$q$, (select id from c)));
rollback;
