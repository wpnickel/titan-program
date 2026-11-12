-- For the tally card list: which of these cards look like a customer the dealership already has?
-- Returns only card ids (never names), and only for cards the signed-in user can see.
create function public.cards_with_similar_customer(p_cards uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.tally_cards c
  where c.id = any (p_cards) and c.deleted_at is null
    and length(c.business_key) >= 4
    and (app.is_super_admin() or c.dealership_id in (select app.visible_dealership_ids()) or c.rep_id = app.my_rep_id())
    and exists (
      select 1 from public.tally_cards o
      where o.dealership_id = c.dealership_id and o.deleted_at is null and o.id <> c.id
        and (o.entry_month, o.sale_date, o.created_at) < (c.entry_month, c.sale_date, c.created_at)
        and (o.business_key = c.business_key
             or (length(o.business_key) >= 5 and length(c.business_key) >= 5
                 and (o.business_key like c.business_key || '%' or c.business_key like o.business_key || '%')))
    )
$$;
revoke execute on function public.cards_with_similar_customer(uuid[]) from public, anon;
grant execute on function public.cards_with_similar_customer(uuid[]) to authenticated;
