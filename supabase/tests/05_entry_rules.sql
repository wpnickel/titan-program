begin;

-- Fixtures: dealerships A (salespeople may NOT enter their own cards) and B (they may) ------------
insert into public.dealerships (id, name, salespeople_enter_own_cards) values
  ('a0000000-0000-0000-0000-00000000000a', 'Dealership A', false),
  ('b0000000-0000-0000-0000-00000000000b', 'Dealership B', true);
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('11111111-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ann', 'A1'),
  ('11111111-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Al', 'A2'),
  ('11111111-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'Bo', 'B1');
insert into auth.users (id, email) select ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'u' || g || '@test' from generate_series(1, 6) g;
-- 1 admin, 2 salesperson A1 (view only), 3 salesperson A2 (own entry on), 4 team admin A, 5 salesperson B1 (view; dealership B allows own entry), 6 owner A (no entry)
insert into public.profiles (id, email, first_name, last_name, preset, scope, dealership_id, rep_id, participates_in_rankings, can_enter_own, can_enter_for_dealership, can_report) values
  ('f0000000-0000-0000-0000-000000000001', 'u1@test', 'Admin', 'One', 'super_admin', 'all', null, null, false, false, true, true),
  ('f0000000-0000-0000-0000-000000000002', 'u2@test', 'Ann', 'A1', 'salesperson_view', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', true, false, false, false),
  ('f0000000-0000-0000-0000-000000000003', 'u3@test', 'Al', 'A2', 'salesperson_enters', 'own', 'a0000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', true, true, false, false),
  ('f0000000-0000-0000-0000-000000000004', 'u4@test', 'Team', 'Admin', 'team_admin', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, true, false),
  ('f0000000-0000-0000-0000-000000000005', 'u5@test', 'Bo', 'B1', 'salesperson_view', 'own', 'b0000000-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000003', true, false, false, false),
  ('f0000000-0000-0000-0000-000000000006', 'u6@test', 'Owner', 'A', 'manager_owner', 'dealership', 'a0000000-0000-0000-0000-00000000000a', null, false, false, false, true);
insert into public.months (month_start, status) values ('2026-09-01', 'in_audit'), ('2026-08-01', 'finalized') on conflict do nothing;

create function t.card_json(p_rep uuid, p_name text, p_month date default '2026-10-01', p_sale date default '2026-10-05',
                            p_type text default 'new_logo', p_products text default 's1000') returns jsonb language sql as $$
  select jsonb_build_object('rep_id', p_rep, 'business_name', p_name, 'entry_month', p_month, 'sale_date', p_sale,
    'customer_type', p_type, 'term_months', 36, 'install_amount', 500, 'rmr_amount', 100,
    'products', (select jsonb_agg(jsonb_build_object('product_id', id, 'quantity', 1)) from public.products where key = p_products))
$$;
create function t.save_as(uid text, j jsonb) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform t.as_user(uid::uuid);
  r := public.save_tally_card(j);
  perform t.as_owner();
  return r;
exception when others then perform t.as_owner(); raise;
end $$;

create function t.save_field(uid text, j jsonb, field text) returns bigint language plpgsql as $$
declare r uuid; v bigint;
begin
  r := t.save_as(uid, j);
  select case when (to_jsonb(c) ->> field) in ('true','false') then ((to_jsonb(c) ->> field)::boolean)::int else (to_jsonb(c) ->> field)::bigint end into v from public.tally_cards c where id = r;
  return v;
end $$;

create function t.upload_ok(uid text, j jsonb) returns bigint language plpgsql as $$
declare r uuid;
begin
  r := t.save_as(uid, j);
  return app.upload_requirement_met(r)::int;
end $$;

-- Who may enter -------------------------------------------------------------------------------------
select t.throws('salesperson without the toggle cannot enter (dealership setting off)', $q$select t.save_as('f0000000-0000-0000-0000-000000000002', t.card_json('11111111-0000-0000-0000-000000000001', 'X1'))$q$);
select t.eq('salesperson with own-entry toggle can enter', $q$select (t.save_as('f0000000-0000-0000-0000-000000000003', t.card_json('11111111-0000-0000-0000-000000000002', 'Own Card')) is not null)::int$q$, 1);
select t.throws('salesperson cannot enter for a colleague', $q$select t.save_as('f0000000-0000-0000-0000-000000000003', t.card_json('11111111-0000-0000-0000-000000000001', 'X2'))$q$);
select t.eq('dealership setting lets a salesperson enter their own', $q$select (t.save_as('f0000000-0000-0000-0000-000000000005', t.card_json('11111111-0000-0000-0000-000000000003', 'B Card')) is not null)::int$q$, 1);
select t.eq('team admin enters for any rep at their dealership', $q$select (t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', 'Team Card')) is not null)::int$q$, 1);
select t.throws('team admin cannot enter for another dealership', $q$select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000003', 'X3'))$q$);
select t.throws('owner without entry rights cannot enter', $q$select t.save_as('f0000000-0000-0000-0000-000000000006', t.card_json('11111111-0000-0000-0000-000000000001', 'X4'))$q$);
select t.eq('super admin enters anywhere', $q$select (t.save_as('f0000000-0000-0000-0000-000000000001', t.card_json('11111111-0000-0000-0000-000000000003', 'Admin Card')) is not null)::int$q$, 1);
select t.throws('signed-out cannot enter', $q$select public.save_tally_card(t.card_json('11111111-0000-0000-0000-000000000001', 'X5'))$q$);

-- Saving sets the dealership, drafts, points and the late flag ------------------------------------
select t.eq('new cards start as drafts', $q$select count(*) from public.tally_cards where business_name = 'Team Card' and not submitted$q$, 1);
select t.eq('card belongs to the rep dealership', $q$select count(*) from public.tally_cards where business_name = 'Team Card' and dealership_id = 'a0000000-0000-0000-0000-00000000000a'$q$, 1);
select t.eq('card remembers who entered it', $q$select count(*) from public.tally_cards where business_name = 'Team Card' and entered_by = 'f0000000-0000-0000-0000-000000000004'$q$, 1);
select t.eq('S1000 card scores 2 points', $q$select points from public.tally_cards where business_name = 'Team Card'$q$, 2);
select t.eq('qualifying card is a new logo', $q$select is_new_logo::int from public.tally_cards where business_name = 'Team Card'$q$, 1);
select t.eq('sale in the entry month is not late', $q$select is_late_entry::int from public.tally_cards where business_name = 'Team Card'$q$, 0);
select t.eq('sale before the entry month is flagged late', $q$select t.save_field('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', 'Late One', p_sale => '2026-09-20'), 'is_late_entry')$q$, 1);
select t.throws('business name is required', $q$select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', '  '))$q$);
select t.throws('entry month must start on the 1st', $q$select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', 'Bad Month', p_month => '2026-10-15'))$q$);

-- Editing -------------------------------------------------------------------------------------------
select t.eq('editing replaces products and rescores', $q$
  select t.save_field('f0000000-0000-0000-0000-000000000004',
    t.card_json('11111111-0000-0000-0000-000000000001', 'Team Card', p_products => 'verified_video') || jsonb_build_object('id', (select id from public.tally_cards where business_name = 'Team Card')), 'points')$q$, 1);
select t.eq('editing does not create a second card', $q$select count(*) from public.tally_cards where business_name = 'Team Card'$q$, 1);
select t.throws('another salesperson cannot edit someone else''s card', $q$
  select t.save_as('f0000000-0000-0000-0000-000000000003', t.card_json('11111111-0000-0000-0000-000000000002', 'Team Card') || jsonb_build_object('id', (select id from public.tally_cards where business_name = 'Team Card')))$q$);
select t.throws('cannot move a card to a rep you cannot enter for', $q$
  select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000003', 'Team Card') || jsonb_build_object('id', (select id from public.tally_cards where business_name = 'Team Card')))$q$);

-- Months ----------------------------------------------------------------------------------------------
select t.throws('a month that is not on the calendar is closed', $q$select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', 'Nope', p_month => '2027-03-01', p_sale => '2027-03-02'))$q$);
select t.throws('a team admin cannot enter in a month in audit', $q$select t.save_as('f0000000-0000-0000-0000-000000000004', t.card_json('11111111-0000-0000-0000-000000000001', 'Audit1', p_month => '2026-09-01', p_sale => '2026-09-02'))$q$);
select t.eq('a super admin can enter in a month in audit', $q$select (t.save_as('f0000000-0000-0000-0000-000000000001', t.card_json('11111111-0000-0000-0000-000000000001', 'Audit2', p_month => '2026-09-01', p_sale => '2026-09-02')) is not null)::int$q$, 1);
select t.throws('nobody can enter in a finalized month', $q$select t.save_as('f0000000-0000-0000-0000-000000000001', t.card_json('11111111-0000-0000-0000-000000000001', 'Fin1', p_month => '2026-08-01', p_sale => '2026-08-02'))$q$);

-- Submitting and uploads -------------------------------------------------------------------------------
select t.throws('a new logo cannot be submitted without a PDF', $q$
  select public.submit_tally_card((select id from public.tally_cards where business_name = 'Team Card')) from t.as_user('f0000000-0000-0000-0000-000000000004')$q$);
select t.as_owner();
insert into public.tally_card_files (card_id, storage_path, file_name, size_bytes)
  select id, 'x/y.pdf', 'contract.pdf', 1000 from public.tally_cards where business_name = 'Team Card';
select t.as_user('f0000000-0000-0000-0000-000000000004');
select public.submit_tally_card((select id from public.tally_cards where business_name = 'Team Card'));
select t.as_owner();
select t.eq('card is submitted once it has its PDF', $q$select submitted::int from public.tally_cards where business_name = 'Team Card'$q$, 1);
select t.eq('small existing-customer card needs no PDF', $q$
  select t.upload_ok('f0000000-0000-0000-0000-000000000004',
    t.card_json('11111111-0000-0000-0000-000000000001', 'Small Existing', p_type => 'existing'))$q$, 1);
select t.eq('residential needs a PDF', $q$
  select t.upload_ok('f0000000-0000-0000-0000-000000000004',
    t.card_json('11111111-0000-0000-0000-000000000001', 'Home Owner', p_type => 'residential'))$q$, 0);
select t.eq('large existing contract (TCV $15,000+) needs a PDF', $q$
  select t.upload_ok('f0000000-0000-0000-0000-000000000004',
    t.card_json('11111111-0000-0000-0000-000000000001', 'Big Existing', p_type => 'existing') || '{"rmr_amount": 500}'::jsonb)$q$, 0);

-- Deleting ----------------------------------------------------------------------------------------------
select t.throws('a salesperson cannot delete someone else''s card', $q$
  select public.delete_tally_card((select id from public.tally_cards where business_name = 'Team Card')) from t.as_user('f0000000-0000-0000-0000-000000000003')$q$);
select t.as_owner();
select t.as_user('f0000000-0000-0000-0000-000000000004');
select public.delete_tally_card((select id from public.tally_cards where business_name = 'Team Card'));
select t.as_owner();
select t.eq('delete is a soft delete', $q$select count(*) from public.tally_cards where business_name = 'Team Card' and deleted_at is not null$q$, 1);
select t.eq('deleted cards score nothing', $q$select points from public.tally_cards where business_name = 'Team Card'$q$, 0);

rollback;
