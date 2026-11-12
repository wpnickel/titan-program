-- Undo "Start audit" on a month: it goes back to open for dealerships. Needs a reason, which is logged.
-- Not possible once a later month has been audited. Months that opened when the audit started stay open.
create function public.cancel_audit(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for returning the month to open.'; end if;
  if not exists (select 1 from public.months where month_start = p_month and status = 'in_audit') then
    raise exception 'Only a month that is in audit can be returned to open.';
  end if;
  if exists (select 1 from public.months where month_start > p_month and status in ('in_audit', 'finalized')) then
    raise exception 'A later month has already been audited, so this month cannot be returned to open.';
  end if;
  update public.months set status = 'open', audit_started_at = null, updated_at = now() where month_start = p_month;
  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
    values (auth.uid(), 'months', p_month::text, 'CANCEL_AUDIT', jsonb_build_object('reason', trim(p_reason)));
end $$;
revoke execute on function public.cancel_audit(date, text) from public, anon;
grant execute on function public.cancel_audit(date, text) to authenticated;
