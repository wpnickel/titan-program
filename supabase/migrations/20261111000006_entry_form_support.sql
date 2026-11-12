-- Helpers the tally card entry screens need. Same rules as save_tally_card, asked as questions.

-- The salespeople the signed-in user may enter cards for.
create function public.enterable_reps() returns table (id uuid, name text, dealership_id uuid, dealership text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.first_name || ' ' || r.last_name, d.id, d.name
  from public.reps r join public.dealerships d on d.id = r.dealership_id
  where r.active and d.active and app.can_enter_for_rep(r.id)
  order by d.name, r.last_name, r.first_name
$$;

-- The months the signed-in user may enter or change cards in, newest first.
create function public.enterable_months() returns table (month_start date, status public.month_status)
language sql stable security definer set search_path = '' as $$
  select m.month_start, m.status from public.months m
  where app.month_allows_entry(m.month_start) order by m.month_start desc limit 6
$$;

-- May the signed-in user change this card (and its uploads) right now?
create function public.can_edit_card(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.can_enter_for_rep(c.rep_id) and app.month_allows_entry(c.entry_month)
    from public.tally_cards c where c.id = p_card and c.deleted_at is null
  ), false)
$$;

-- Record an uploaded PDF on a card (the file itself is stored by the server).
create function public.add_card_file(p_card uuid, p_path text, p_name text, p_size integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  if not public.can_edit_card(p_card) then raise exception 'You cannot change that card.'; end if;
  if (select count(*) from public.tally_card_files where card_id = p_card) >= 20 then
    raise exception 'A card can have up to 20 files.';
  end if;
  insert into public.tally_card_files (card_id, storage_path, file_name, size_bytes, uploaded_by)
  values (p_card, p_path, p_name, p_size, auth.uid()) returning id into fid;
  return fid;
end $$;

-- Remove an uploaded PDF from a card; returns where it was stored so the server can delete the file.
create function public.remove_card_file(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare f public.tally_card_files;
begin
  select * into f from public.tally_card_files where id = p_file;
  if f.id is null or not public.can_edit_card(f.card_id) then raise exception 'You cannot change that card.'; end if;
  delete from public.tally_card_files where id = p_file;
  return f.storage_path;
end $$;

-- Customers at a dealership whose name looks like the one being entered (for the new logo check).
create function public.similar_customers(p_dealership uuid, p_name text, p_exclude uuid default null)
returns table (business_name text, first_sale date, cards integer)
language plpgsql stable security definer set search_path = '' as $$
declare k text := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '', 'g'));
begin
  if length(k) < 4 or not exists (select 1 from public.dealerships d where d.id = p_dealership and (app.is_super_admin() or d.id in (select app.visible_dealership_ids())
       or d.id = (select dealership_id from public.reps where id = app.my_rep_id()))) then
    return;
  end if;
  return query
    select (array_agg(c.business_name order by c.sale_date))[1], min(c.sale_date), count(*)::integer
    from public.tally_cards c
    where c.dealership_id = p_dealership and c.deleted_at is null and (p_exclude is null or c.id <> p_exclude)
      and (c.business_key = k or (length(c.business_key) >= 5 and (c.business_key like k || '%' or k like c.business_key || '%')))
    group by c.business_key
    order by min(c.sale_date)
    limit 5;
end $$;

revoke execute on function public.enterable_reps(), public.enterable_months(), public.can_edit_card(uuid),
  public.add_card_file(uuid, text, text, integer), public.remove_card_file(uuid), public.similar_customers(uuid, text, uuid) from public, anon;
grant execute on function public.enterable_reps(), public.enterable_months(), public.can_edit_card(uuid),
  public.add_card_file(uuid, text, text, integer), public.remove_card_file(uuid), public.similar_customers(uuid, text, uuid) to authenticated;

-- A contract under 12 months does not count in any category, points included.
create or replace function app.card_points(p_card uuid) returns integer
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
  join public.tally_cards c on c.id = cp.card_id
  where cp.card_id = p_card and cp.quantity > 0 and c.term_months >= 12
$$;
