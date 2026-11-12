begin;

insert into public.dealerships (id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'Dealer One'),
  ('d2000000-0000-0000-0000-000000000002', 'Dealer Two');
insert into public.reps (id, dealership_id, first_name, last_name) values
  ('a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Rep', 'One'),
  ('a2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Rep', 'Two');

-- Helper: make a card with products given as 'key:qty,key:qty', returning its id.
create function t.card(p_name text, p_products text, p_type public.customer_type default 'new_logo',
                       p_rmr numeric default 100, p_install numeric default 500, p_term int default 36,
                       p_addendum boolean default false, p_month date default '2026-10-01', p_sale date default '2026-10-05',
                       p_dealer uuid default 'd1000000-0000-0000-0000-000000000001') returns uuid language plpgsql as $$
declare cid uuid; item text;
begin
  insert into public.tally_cards (dealership_id, rep_id, entry_month, sale_date, business_name, customer_type, addendum, term_months, install_amount, rmr_amount)
  values (p_dealer, case when p_dealer = 'd1000000-0000-0000-0000-000000000001' then 'a1000000-0000-0000-0000-000000000001'::uuid else 'a2000000-0000-0000-0000-000000000002'::uuid end,
          p_month, p_sale, p_name, p_type, p_addendum, p_term, p_install, p_rmr)
  returning id into cid;
  foreach item in array string_to_array(coalesce(nullif(p_products, ''), 'none:0'), ',') loop
    if split_part(item, ':', 1) <> 'none' then
      insert into public.tally_card_products (card_id, product_id, quantity)
      select cid, id, split_part(item, ':', 2)::int from public.products where key = split_part(item, ':', 1);
    end if;
  end loop;
  perform app.refresh_card_score(cid);
  return cid;
end $$;
create function t.pts(c uuid) returns bigint language sql as $$ select points from public.tally_cards where id = c $$;
create function t.nl(c uuid) returns bigint language sql as $$ select is_new_logo::int from public.tally_cards where id = c $$;

-- Points ------------------------------------------------------------------------------------------
select t.eq('intrusion alone earns nothing', format($q$select t.pts(t.card('P1', 'sonitrol_intrusion:2', 'existing'))$q$), 0);
select t.eq('intrusion with an audio sensor earns 1', format($q$select t.pts(t.card('P2', 'sonitrol_intrusion:1,audio_sensor:9', 'existing'))$q$), 1);
select t.eq('audio sensor alone earns nothing', format($q$select t.pts(t.card('P3', 'audio_sensor:9', 'existing'))$q$), 0);
select t.eq('managed access earns 1 whatever the quantity', format($q$select t.pts(t.card('P4', 'managed_access:32', 'existing'))$q$), 1);
select t.eq('verified video earns 1', format($q$select t.pts(t.card('P5', 'verified_video:3', 'existing'))$q$), 1);
select t.eq('S1000 earns 2', format($q$select t.pts(t.card('P6', 's1000:2', 'existing'))$q$), 2);
select t.eq('warranty earns 1', format($q$select t.pts(t.card('P7', 'warranty:1', 'existing'))$q$), 1);
select t.eq('NVR other earns nothing', format($q$select t.pts(t.card('P8', 'nvr_other:4', 'existing'))$q$), 0);
select t.eq('fire products earn nothing', format($q$select t.pts(t.card('P9', 'fire_panel:1,fire_communicator:2,multi_sensor:3', 'existing'))$q$), 0);
select t.eq('a card with everything tops out at 6', format($q$select t.pts(t.card('P10', 'sonitrol_intrusion:1,audio_sensor:5,managed_access:2,verified_video:1,s1000:1,warranty:1', 'existing'))$q$), 6);
select t.eq('residential cards still earn points', format($q$select t.pts(t.card('P11', 's1000:1', 'residential'))$q$), 2);

-- New logo rules ----------------------------------------------------------------------------------
select t.eq('a qualifying new logo counts', format($q$select t.nl(t.card('N1', 'managed_access:1'))$q$), 1);
select t.eq('intrusion qualifies even without audio', format($q$select t.nl(t.card('N2', 'sonitrol_intrusion:1'))$q$), 1);
select t.eq('verified video qualifies', format($q$select t.nl(t.card('N3', 'verified_video:1'))$q$), 1);
select t.eq('S1000 qualifies', format($q$select t.nl(t.card('N4', 's1000:1'))$q$), 1);
select t.eq('addendum is never a new logo', format($q$select t.nl(t.card('N5', 's1000:1', p_addendum => true))$q$), 0);
select t.eq('an existing customer is not a new logo', format($q$select t.nl(t.card('N6', 's1000:1', 'existing'))$q$), 0);
select t.eq('residential is never a new logo', format($q$select t.nl(t.card('N7', 's1000:1', 'residential'))$q$), 0);
select t.eq('RMR of 49.99 is too low', format($q$select t.nl(t.card('N8', 's1000:1', p_rmr => 49.99))$q$), 0);
select t.eq('RMR of exactly 50 is enough', format($q$select t.nl(t.card('N9', 's1000:1', p_rmr => 50))$q$), 1);
select t.eq('install of 249.99 is too low', format($q$select t.nl(t.card('N10', 's1000:1', p_install => 249.99))$q$), 0);
select t.eq('install of exactly 250 is enough', format($q$select t.nl(t.card('N11', 's1000:1', p_install => 250))$q$), 1);
select t.eq('an 11 month term is too short', format($q$select t.nl(t.card('N12', 's1000:1', p_term => 11))$q$), 0);
select t.eq('a 12 month term is enough', format($q$select t.nl(t.card('N13', 's1000:1', p_term => 12))$q$), 1);
select t.eq('warranty alone does not qualify', format($q$select t.nl(t.card('N14', 'warranty:1'))$q$), 0);
select t.eq('NVR other does not qualify', format($q$select t.nl(t.card('N15', 'nvr_other:1'))$q$), 0);

-- Never sold to this company before --------------------------------------------------------------
create temp table h (k text primary key, id uuid);
insert into h select 'first', t.card('Acme, Inc.', 's1000:1', p_month => '2026-09-01', p_sale => '2026-09-20');
insert into h select 'second', t.card('ACME INC', 's1000:1', p_month => '2026-10-01', p_sale => '2026-10-02');
select t.eq('the first sale to a company is the new logo', $q$select t.nl((select id from h where k = 'first'))$q$, 1);
select t.eq('a later sale to the same company (same dealership) is not', $q$select t.nl((select id from h where k = 'second'))$q$, 0);
select t.eq('names that differ only in punctuation and case match', $q$select count(distinct business_key) from public.tally_cards where business_name in ('Acme, Inc.', 'ACME INC')$q$, 1);
insert into h select 'other_dealer', t.card('Acme Inc', 's1000:1', p_dealer => 'd2000000-0000-0000-0000-000000000002');
select t.eq('a different dealership can still have its own new logo', $q$select t.nl((select id from h where k = 'other_dealer'))$q$, 1);

-- Deleting or demoting the earlier card hands the new logo to the next one.
update public.tally_cards set deleted_at = now() where id = (select id from h where k = 'first');
select app.refresh_card_score((select id from h where k = 'first'));
select t.eq('a deleted card scores nothing', $q$select t.nl((select id from h where k = 'first'))$q$, 0);
select t.eq('the next card becomes the new logo', $q$select t.nl((select id from h where k = 'second'))$q$, 1);

-- Same month: the earlier sale date wins.
insert into h select 'same_a', t.card('Zed Corp', 's1000:1', p_sale => '2026-10-20');
insert into h select 'same_b', t.card('Zed Corp', 's1000:1', p_sale => '2026-10-10');
select t.eq('same month: the earlier sale date is the new logo', $q$select t.nl((select id from h where k = 'same_b'))$q$, 1);
select t.eq('same month: the later sale date is not', $q$select t.nl((select id from h where k = 'same_a'))$q$, 0);

-- Finalized months are frozen -------------------------------------------------------------------
insert into h select 'frozen', t.card('Frozen Co', 's1000:1', p_month => '2026-08-01', p_sale => '2026-08-05');
insert into public.months (month_start, status) values ('2026-08-01', 'finalized');
update public.tally_card_products set quantity = 1 where card_id = (select id from h where k = 'frozen');
delete from public.tally_card_products where card_id = (select id from h where k = 'frozen');
select app.refresh_card_score((select id from h where k = 'frozen'));
select t.eq('a finalized month keeps its points', $q$select t.pts((select id from h where k = 'frozen'))$q$, 2);
select t.eq('a finalized month keeps its new logo', $q$select t.nl((select id from h where k = 'frozen'))$q$, 1);

-- TCV is rmr x term + install --------------------------------------------------------------------
insert into h select 'tcv', t.card('Tcv Co', 's1000:1', p_rmr => 76, p_install => 898, p_term => 36);
select t.eq('TCV = RMR x term + install', $q$select tcv::bigint from public.tally_cards where id = (select id from h where k = 'tcv')$q$, 3634);

rollback;
