-- The last PDF cannot be removed from a submitted card that needs one. Add the replacement first.
create or replace function public.remove_card_file(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare f public.tally_card_files; c public.tally_cards;
begin
  select * into f from public.tally_card_files where id = p_file;
  if f.id is null or not public.can_edit_card(f.card_id) then raise exception 'You cannot change that card.'; end if;
  select * into c from public.tally_cards where id = f.card_id;
  if c.submitted and (c.customer_type <> 'existing' or c.tcv >= 15000)
     and not exists (select 1 from public.tally_card_files x where x.card_id = f.card_id and x.id <> f.id) then
    raise exception 'This card needs a PDF, so the last one cannot be removed. Add the new PDF first, then remove this one.';
  end if;
  delete from public.tally_card_files where id = p_file;
  return f.storage_path;
end $$;
