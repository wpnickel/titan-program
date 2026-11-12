-- Editing a submitted card into a new logo, residential, or $15,000+ card now requires the PDF before it can be saved.
create or replace function public.save_tally_card(p jsonb) returns uuid
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
    -- A submitted card that is edited into something that needs a PDF (a new logo, residential, or TCV of $15,000+) must have one.
    -- Cards that already needed one before the edit are left alone, so old cards can still be corrected.
    if old.submitted
       and not (old.customer_type <> 'existing' or old.tcv >= 15000)
       and not app.upload_requirement_met(v_id) then
      raise exception 'This card now needs a PDF upload (new logos, residential, and TCV of $15,000 or more). Add the PDF, then save.';
    end if;
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
