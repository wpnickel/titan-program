-- Tally cards: reference lists, the card itself, products, lead sources, uploads, and the scoring rules.

create type public.customer_type as enum ('existing', 'new_logo', 'residential');

-- Reference lists (editable data, so the form's choices can change without new code) ------------
create table public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort integer not null default 0,
  active boolean not null default true
);
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort integer not null default 0,
  active boolean not null default true
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort integer not null default 0,
  active boolean not null default true,
  points integer not null default 0,                     -- points per card (not per quantity)
  qualifies_new_logo boolean not null default false,     -- Sonitrol product that can make a new logo
  needs_audio_sensor boolean not null default false      -- point only counts if an audio sensor is on the card
);

insert into public.industries (name, sort)
select n, row_number() over (order by n) from unnest(array[
  'Agriculture','Air Conditioning','Apartment/Condo','Assisted Living','Automotive','Banking','Beauty','Cell Phone Company',
  'Check Cashing','Construction','Country Club','Day Care','Entertainment','Equipment Rental','Faith Based','Gas/Convenient Store',
  'Government','Grocery','Gym/Fitness','Hotel/Motel','Import / Export Company','Lawn and Garden','Manufacturing/Distribution','Massage/Therapy',
  'Media','Medical - Hospital','Medical - Office','Moving/Storage','Non-Profit','Office','Pawn Shop','Pharmaceutical','Property Management',
  'Recreational','Rental','Residential','Restaurant/Bar','Retail: Electronic Store','Retail: Gun Shops','Retail: High-End',
  'Retail: Liquor Store','Retail: Sporting Goods','Retail: Tire or Wheels','School: College/University','School: K-12','Semiconductor',
  'Telecommunications','Transportation','Utilities','Veterinarian'
]) as n;

insert into public.lead_sources (name, sort) values
  ('Call in', 1), ('Cold Call', 2), ('Customer Add On', 3), ('Customer Move', 4), ('Customer New Site', 5),
  ('Customer Referral', 6), ('Franchisor/Distributor', 7), ('Leads Group', 8), ('Networking', 9), ('New Construction', 10),
  ('Online Lead', 11), ('Police Referral', 12), ('Takeover', 13), ('Upgrade', 14);

insert into public.products (key, label, sort, active, points, qualifies_new_logo, needs_audio_sensor) values
  ('sonitrol_intrusion',   'Sonitrol Intrusion (FlexIP)',      1, true,  1, true,  true),
  ('audio_sensor',         'Audio Sensor',                     2, true,  0, false, false),
  ('multi_sensor',         'Multi-Sensor',                     3, true,  0, false, false),
  ('managed_access',       'Managed Access (access module)',   4, true,  1, true,  false),
  ('verified_video',       'Verified Video (3xLogic NVR)',     5, true,  1, true,  false),
  ('nvr_other',            'NVR (other)',                      6, true,  0, false, false),
  ('s1000',                'S1000',                            7, true,  2, true,  false),
  ('fire_panel',           'Fire Panel',                       8, true,  0, false, false),
  ('fire_communicator',    'Fire Communicator',                9, true,  0, false, false),
  ('warranty',             'Sonitrol Warranty',               10, true,  1, false, false),
  ('total_guard',          'Total Guard',                     11, false, 0, false, false),
  ('access_infinias',      'Access Infinias',                 12, false, 0, false, false),
  ('access_control_other', 'Access Control (other)',          13, false, 0, false, false),
  ('intrusion_other',      'Intrusion System (other)',        14, false, 0, false, false);

-- Tally cards ------------------------------------------------------------------------------------
create table public.tally_cards (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer unique,                                   -- id in the old app, for imported history
  dealership_id uuid not null references public.dealerships (id),
  rep_id uuid not null references public.reps (id),           -- the salesperson who gets credit
  entered_by uuid references public.profiles (id),            -- the login that entered it (null for imports)
  entry_month date not null check (entry_month = date_trunc('month', entry_month)::date),
  sale_date date not null,
  business_name text not null,
  business_key text generated always as (lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '', 'g'))) stored,
  zip_code text,
  industry_id uuid references public.industries (id),
  customer_type public.customer_type not null default 'existing',
  addendum boolean not null default false,
  contract_number text,
  term_months integer not null check (term_months >= 0),
  install_amount numeric(12, 2) not null default 0 check (install_amount >= 0),
  rmr_amount numeric(12, 2) not null default 0 check (rmr_amount >= 0),
  tcv numeric(14, 2) generated always as (round(rmr_amount * term_months + install_amount, 2)) stored,
  comments text,
  -- Worked out by the scoring functions below and frozen once the month is finalized.
  points integer not null default 0,
  is_new_logo boolean not null default false,
  is_late_entry boolean not null default false,
  submitted boolean not null default true,                    -- false = draft (needs uploads before it can be submitted)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tally_cards_dealership_month_idx on public.tally_cards (dealership_id, entry_month);
create index tally_cards_rep_idx on public.tally_cards (rep_id);
create index tally_cards_company_idx on public.tally_cards (dealership_id, business_key);

create table public.tally_card_products (
  card_id uuid not null references public.tally_cards (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  primary key (card_id, product_id)
);
create table public.tally_card_lead_sources (
  card_id uuid not null references public.tally_cards (id) on delete cascade,
  lead_source_id uuid not null references public.lead_sources (id),
  primary key (card_id, lead_source_id)
);
create table public.tally_card_files (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.tally_cards (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),   -- 20 MB
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Scoring rules -----------------------------------------------------------------------------------
-- Points per card: each product on the card earns its points once, whatever the quantity.
-- Intrusion earns its point only when an audio sensor is on the same card.
create function app.card_points(p_card uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(
    case when p.needs_audio_sensor
      then case when exists (
        select 1 from public.tally_card_products ap join public.products a on a.id = ap.product_id
        where ap.card_id = p_card and a.key = 'audio_sensor' and ap.quantity > 0
      ) then p.points else 0 end
      else p.points end
  ), 0)::integer
  from public.tally_card_products cp join public.products p on p.id = cp.product_id
  where cp.card_id = p_card and cp.quantity > 0
$$;

-- Everything a new logo needs except "the dealership has never sold to this company before".
create function app.card_meets_new_logo_rules(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.customer_type = 'new_logo'
       and not c.addendum
       and c.term_months >= 12
       and c.rmr_amount >= 50
       and c.install_amount >= 250
       and exists (
         select 1 from public.tally_card_products cp join public.products p on p.id = cp.product_id
         where cp.card_id = c.id and cp.quantity > 0 and p.qualifies_new_logo
       )
    from public.tally_cards c where c.id = p_card
  ), false)
$$;

-- Recalculate points and new-logo flags for every card of one company at one dealership.
-- Only the earliest card (by entry month, then sale date, then when it was created) can be the new logo.
-- Cards in a finalized month are never touched.
create function app.refresh_company(p_dealership uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  with ordered as (
    select c.id,
           row_number() over (order by c.entry_month, c.sale_date, c.created_at, c.id) as rn
    from public.tally_cards c
    where c.dealership_id = p_dealership and c.business_key = p_key and c.deleted_at is null
  )
  update public.tally_cards c
     set points = app.card_points(c.id),
         is_new_logo = (o.rn = 1 and app.card_meets_new_logo_rules(c.id)),
         updated_at = now()
    from ordered o
   where c.id = o.id
     and not exists (select 1 from public.months m where m.month_start = c.entry_month and m.status = 'finalized')
     and (c.points, c.is_new_logo) is distinct from (app.card_points(c.id), (o.rn = 1 and app.card_meets_new_logo_rules(c.id)));

  -- Deleted cards score nothing (unless frozen).
  update public.tally_cards c set points = 0, is_new_logo = false
   where c.dealership_id = p_dealership and c.business_key = p_key and c.deleted_at is not null
     and (c.points <> 0 or c.is_new_logo)
     and not exists (select 1 from public.months m where m.month_start = c.entry_month and m.status = 'finalized');
end $$;

create function app.refresh_card_score(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d uuid; k text;
begin
  select dealership_id, business_key into d, k from public.tally_cards where id = p_card;
  if d is not null then perform app.refresh_company(d, k); end if;
end $$;

grant execute on function app.card_points(uuid), app.card_meets_new_logo_rules(uuid) to authenticated;

-- Audit trail and row-level security -------------------------------------------------------------
create trigger audit_tally_cards after insert or update or delete on public.tally_cards
  for each row execute function app.audit_change();
create trigger audit_tally_card_products after insert or update or delete on public.tally_card_products
  for each row execute function app.audit_change();
create trigger audit_tally_card_lead_sources after insert or update or delete on public.tally_card_lead_sources
  for each row execute function app.audit_change();
create trigger audit_tally_card_files after insert or update or delete on public.tally_card_files
  for each row execute function app.audit_change();

alter table public.industries enable row level security;
alter table public.lead_sources enable row level security;
alter table public.products enable row level security;
alter table public.tally_cards enable row level security;
alter table public.tally_card_products enable row level security;
alter table public.tally_card_lead_sources enable row level security;
alter table public.tally_card_files enable row level security;

-- Lists are readable by everyone signed in; only super admins change them.
create policy industries_read on public.industries for select to authenticated using (true);
create policy industries_admin on public.industries for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy lead_sources_read on public.lead_sources for select to authenticated using (true);
create policy lead_sources_admin on public.lead_sources for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy products_read on public.products for select to authenticated using (true);
create policy products_admin on public.products for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

-- A person sees their own cards, or every card at the dealerships they cover. Super admins see everything.
-- (Entering and editing goes through server functions added with the entry form.)
create policy tally_cards_read on public.tally_cards for select to authenticated
  using (app.is_super_admin() or rep_id = app.my_rep_id() or dealership_id in (select app.visible_dealership_ids()));
create policy tally_cards_admin on public.tally_cards for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy tally_card_products_read on public.tally_card_products for select to authenticated
  using (exists (select 1 from public.tally_cards c where c.id = card_id));
create policy tally_card_products_admin on public.tally_card_products for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy tally_card_lead_sources_read on public.tally_card_lead_sources for select to authenticated
  using (exists (select 1 from public.tally_cards c where c.id = card_id));
create policy tally_card_lead_sources_admin on public.tally_card_lead_sources for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy tally_card_files_read on public.tally_card_files for select to authenticated
  using (exists (select 1 from public.tally_cards c where c.id = card_id));
create policy tally_card_files_admin on public.tally_card_files for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());
