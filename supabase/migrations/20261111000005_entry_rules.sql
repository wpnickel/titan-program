-- Who may enter, edit, submit and delete tally cards, and in which months. One place for the rules,
-- so every screen and every future import follows them.

-- Open months for testing (the month calendar and audit button arrive with the audit phase).
insert into public.months (month_start, status) values ('2026-10-01', 'open'), ('2026-11-01', 'open')
on conflict (month_start) do nothing;

-- Private storage for card PDFs. Only the server touches it (signed links), so no storage policies are added.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('tally-uploads', 'tally-uploads', false, 20971520, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;

-- May the signed-in user enter or change cards for this rep?
create function app.can_enter_for_rep(p_rep uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; r public.reps; own_ok boolean;
begin
  select * into me from public.profiles where id = auth.uid() and active;
  if me.id is null then return false; end if;
  if me.preset = 'super_admin' then return true; end if;
  select * into r from public.reps where id = p_rep;
  if r.id is null then return false; end if;
  -- Entering for the whole dealership (Team Admins and anyone given the toggle).
  if me.can_enter_for_dealership and r.dealership_id in (select app.visible_dealership_ids()) then return true; end if;
  -- Entering their own cards: the person's own toggle, or the dealership-wide setting for salespeople.
  if me.rep_id is not null and me.rep_id = r.id then
    select (me.can_enter_own or (me.preset in ('salesperson_view', 'salesperson_enters') and d.salespeople_enter_own_cards))
      into own_ok from public.dealerships d where d.id = r.dealership_id;
    return coalesce(own_ok, false);
  end if;
  return false;
end $$;

-- May the signed-in user change cards in this month? Open: anyone allowed to enter. In audit: super admin only.
-- Finalized: nobody, until the month is reopened.
create function app.month_allows_entry(p_month date) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case m.status
      when 'open' then true
      when 'in_audit' then app.is_super_admin()
      else false end
    from public.months m where m.month_start = p_month
  ), false)
$$;

-- Does this card have the PDF it needs? New logos, residential and TCV of $15,000 or more need at least one.
create function app.upload_requirement_met(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (c.customer_type = 'existing' and c.tcv < 15000)
        or exists (select 1 from public.tally_card_files f where f.card_id = c.id)
    from public.tally_cards c where c.id = p_card
  ), false)
$$;

-- Create or change a card. p: id (to edit), rep_id, entry_month, sale_date, business_name, zip_code, industry_id,
-- customer_type, addendum, contract_number, term_months, install_amount, rmr_amount, comments,
-- products [{product_id, quantity}], lead_source_ids [ids]. New cards start as drafts until submitted.
create function public.save_tally_card(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_rep uuid := nullif(p ->> 'rep_id', '')::uuid;
  v_month date := nullif(p ->> 'entry_month', '')::date;
  v_sale date := nullif(p ->> 'sale_date', '')::date;
  v_dealer uuid;
  old public.tally_cards;
  me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.profiles where id = me and active) then
    raise exception 'Please sign in again.';
  end if;
  if v_rep is null or v_month is null or v_sale is null then raise exception 'Choose the salesperson, the month and the sale date.'; end if;
  if coalesce(trim(p ->> 'business_name'), '') = '' then raise exception 'Enter the business name.'; end if;
  if v_month <> date_trunc('month', v_month)::date then raise exception 'Invalid month.'; end if;
  if not app.can_enter_for_rep(v_rep) then raise exception 'You cannot enter cards for that salesperson.'; end if;
  if not app.month_allows_entry(v_month) then raise exception 'That month is not open for entry.'; end if;
  select dealership_id into v_dealer from public.reps where id = v_rep;

  if v_id is not null then
    select * into old from public.tally_cards where id = v_id and deleted_at is null;
    if old.id is null then raise exception 'Card not found.'; end if;
    if not app.can_enter_for_rep(old.rep_id) then raise exception 'You cannot change that card.'; end if;
    if not app.month_allows_entry(old.entry_month) then raise exception 'That card is in a month that is closed for changes.'; end if;
    update public.tally_cards set
      dealership_id = v_dealer, rep_id = v_rep, entry_month = v_month, sale_date = v_sale,
      business_name = trim(p ->> 'business_name'), zip_code = nullif(trim(p ->> 'zip_code'), ''),
      industry_id = nullif(p ->> 'industry_id', '')::uuid,
      customer_type = coalesce(nullif(p ->> 'customer_type', ''), 'existing')::public.customer_type,
      addendum = coalesce((p ->> 'addendum')::boolean, false),
      contract_number = nullif(trim(p ->> 'contract_number'), ''),
      term_months = coalesce((p ->> 'term_months')::int, 0),
      install_amount = coalesce((p ->> 'install_amount')::numeric, 0),
      rmr_amount = coalesce((p ->> 'rmr_amount')::numeric, 0),
      comments = nullif(trim(p ->> 'comments'), ''),
      is_late_entry = v_sale < v_month, updated_at = now()
    where id = v_id;
  else
    insert into public.tally_cards (dealership_id, rep_id, entered_by, entry_month, sale_date, business_name, zip_code, industry_id,
      customer_type, addendum, contract_number, term_months, install_amount, rmr_amount, comments, is_late_entry, submitted)
    values (v_dealer, v_rep, me, v_month, v_sale, trim(p ->> 'business_name'), nullif(trim(p ->> 'zip_code'), ''),
      nullif(p ->> 'industry_id', '')::uuid,
      coalesce(nullif(p ->> 'customer_type', ''), 'existing')::public.customer_type,
      coalesce((p ->> 'addendum')::boolean, false), nullif(trim(p ->> 'contract_number'), ''),
      coalesce((p ->> 'term_months')::int, 0), coalesce((p ->> 'install_amount')::numeric, 0),
      coalesce((p ->> 'rmr_amount')::numeric, 0), nullif(trim(p ->> 'comments'), ''), v_sale < v_month, false)
    returning id into v_id;
  end if;

  delete from public.tally_card_products where card_id = v_id;
  insert into public.tally_card_products (card_id, product_id, quantity)
    select v_id, (x ->> 'product_id')::uuid, (x ->> 'quantity')::int
    from jsonb_array_elements(coalesce(p -> 'products', '[]'::jsonb)) x
    where coalesce((x ->> 'quantity')::int, 0) > 0;
  delete from public.tally_card_lead_sources where card_id = v_id;
  insert into public.tally_card_lead_sources (card_id, lead_source_id)
    select v_id, (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'lead_source_ids', '[]'::jsonb)) x;

  perform app.refresh_card_score(v_id);
  -- If the card moved to another company or dealership, the old one needs recalculating too.
  if old.id is not null and (old.dealership_id, old.business_key) is distinct from
     (select (dealership_id, business_key) from public.tally_cards where id = v_id) then
    perform app.refresh_company(old.dealership_id, old.business_key);
  end if;
  return v_id;
end $$;

-- Submit a draft once it has the uploads it needs.
create function public.submit_tally_card(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.tally_cards;
begin
  select * into c from public.tally_cards where id = p_id and deleted_at is null;
  if c.id is null then raise exception 'Card not found.'; end if;
  if not app.can_enter_for_rep(c.rep_id) then raise exception 'You cannot change that card.'; end if;
  if not app.month_allows_entry(c.entry_month) then raise exception 'That month is not open for entry.'; end if;
  if not app.upload_requirement_met(c.id) then
    raise exception 'This card needs a PDF upload (new logos, residential, and TCV of $15,000 or more).';
  end if;
  update public.tally_cards set submitted = true, updated_at = now() where id = p_id;
end $$;

create function public.delete_tally_card(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.tally_cards;
begin
  select * into c from public.tally_cards where id = p_id and deleted_at is null;
  if c.id is null then raise exception 'Card not found.'; end if;
  if not app.can_enter_for_rep(c.rep_id) then raise exception 'You cannot delete that card.'; end if;
  if not app.month_allows_entry(c.entry_month) then raise exception 'That month is not open for changes.'; end if;
  update public.tally_cards set deleted_at = now() where id = p_id;
  perform app.refresh_company(c.dealership_id, c.business_key);
end $$;

revoke execute on function public.save_tally_card(jsonb), public.submit_tally_card(uuid), public.delete_tally_card(uuid) from public, anon;
grant execute on function public.save_tally_card(jsonb), public.submit_tally_card(uuid), public.delete_tally_card(uuid) to authenticated;
grant execute on function app.can_enter_for_rep(uuid), app.month_allows_entry(date), app.upload_requirement_met(uuid) to authenticated;
