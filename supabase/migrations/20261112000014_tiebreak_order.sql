-- Tie-breakers you can reorder: the order of the four categories used to break ties.
-- Within a category the tie goes to the category's own value first; then the others are used in this order.
-- For the overall score the same order is used on the category ranks.
-- The order is saved with each month when it is finalized, so changing it only affects months finalized afterwards.
insert into public.app_settings (key, value) values ('tiebreak_order', 'rmr,new_logos,points,install') on conflict do nothing;
alter table public.months add column tiebreak_order text;

-- The order that applies to a month: the one saved when it was finalized, otherwise the current setting.
create function app.tiebreak_order(p_month date) returns text[]
language sql stable security definer set search_path = '' as $$
  with chosen as (
    select string_to_array(coalesce((select m.tiebreak_order from public.months m where m.month_start = p_month),
                                     (select value from public.app_settings where key = 'tiebreak_order')), ',') as o
  )
  select case when o @> array['rmr', 'install', 'new_logos', 'points'] and cardinality(o) = 4 then o
              else array['rmr', 'new_logos', 'points', 'install'] end
  from chosen
$$;

-- Change the order (super admin). p_order lists all four of rmr, install, new_logos, points, first = strongest.
create function public.save_tiebreak_order(p_order text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if p_order is null or cardinality(p_order) <> 4 or not (p_order @> array['rmr', 'install', 'new_logos', 'points']) then
    raise exception 'Invalid tie-breaker order. Use each category once.';
  end if;
  insert into public.app_settings (key, value) values ('tiebreak_order', array_to_string(p_order, ','))
    on conflict (key) do update set value = excluded.value;
end $$;
create function public.get_tiebreak_order() returns text[]
language sql stable security definer set search_path = '' as $$
  select case when app.is_super_admin() then app.tiebreak_order(null) end
$$;
revoke execute on function public.save_tiebreak_order(text[]), public.get_tiebreak_order() from public, anon;
grant execute on function public.save_tiebreak_order(text[]), public.get_tiebreak_order() to authenticated;

drop function app.board_rows(date, date);
create function app.board_rows(p_from date, p_to date, p_order text[])
returns table (rep_id uuid, first_name text, last_name text, dealership text, is_securitas boolean,
               rmr numeric, install numeric, new_logos integer, points integer,
               rmr_rank integer, install_rank integer, new_logo_rank integer, points_rank integer,
               score integer, overall_rank integer)
language sql stable security definer set search_path = '' as $$
  with vals0 as (
    select r.id as rep_id, r.first_name, r.last_name, d.name as dealership, d.is_securitas,
           coalesce(sum(case when c.term_months >= 12 and c.customer_type <> 'residential' then c.rmr_amount end), 0) as rmr,
           coalesce(sum(case when c.term_months >= 12 and c.customer_type <> 'residential' then c.install_amount end), 0) as install,
           coalesce(sum(case when c.is_new_logo then 1 end), 0)::integer as nl,
           coalesce(sum(c.points), 0)::integer as pts
    from public.reps r
    join public.dealerships d on d.id = r.dealership_id
    left join public.tally_cards c on c.rep_id = r.id and c.deleted_at is null and c.submitted
                                  and c.entry_month between p_from and p_to
    where not exists (select 1 from public.profiles p where p.rep_id = r.id and not p.participates_in_rankings)
    group by r.id, r.first_name, r.last_name, d.name, d.is_securitas, r.active
    having r.active or count(c.id) > 0
  ), vals as (
    -- k1..k4: the four values in tie-breaker order
    select v.*,
      case p_order[1] when 'rmr' then rmr when 'install' then install when 'new_logos' then nl else pts end as k1,
      case p_order[2] when 'rmr' then rmr when 'install' then install when 'new_logos' then nl else pts end as k2,
      case p_order[3] when 'rmr' then rmr when 'install' then install when 'new_logos' then nl else pts end as k3,
      case p_order[4] when 'rmr' then rmr when 'install' then install when 'new_logos' then nl else pts end as k4
    from vals0 v
  ), a as (select rep_id, rank() over (order by rmr desc, k1 desc, k2 desc, k3 desc, k4 desc) as rk from vals where rmr > 0),
     b as (select rep_id, rank() over (order by install desc, k1 desc, k2 desc, k3 desc, k4 desc) as rk from vals where install > 0),
     c as (select rep_id, rank() over (order by nl desc, k1 desc, k2 desc, k3 desc, k4 desc) as rk from vals where nl > 0),
     e as (select rep_id, rank() over (order by pts desc, k1 desc, k2 desc, k3 desc, k4 desc) as rk from vals where pts > 0),
     j as (
       select v.*, a.rk as ra, b.rk as rb, c.rk as rc, e.rk as re,
              case when a.rk is not null and b.rk is not null and c.rk is not null and e.rk is not null then a.rk + b.rk + c.rk + e.rk end as score
       from vals v left join a using (rep_id) left join b using (rep_id) left join c using (rep_id) left join e using (rep_id)
     ), j2 as (
       select j.*,
         case p_order[1] when 'rmr' then ra when 'install' then rb when 'new_logos' then rc else re end as o1,
         case p_order[2] when 'rmr' then ra when 'install' then rb when 'new_logos' then rc else re end as o2,
         case p_order[3] when 'rmr' then ra when 'install' then rb when 'new_logos' then rc else re end as o3,
         case p_order[4] when 'rmr' then ra when 'install' then rb when 'new_logos' then rc else re end as o4
       from j
     )
  select j2.rep_id, j2.first_name, j2.last_name, j2.dealership, j2.is_securitas, j2.rmr, j2.install, j2.nl, j2.pts,
         j2.ra::integer, j2.rb::integer, j2.rc::integer, j2.re::integer, j2.score::integer,
         (case when j2.score is not null then rank() over (order by j2.score nulls last, j2.o1, j2.o2, j2.o3, j2.o4) end)::integer
  from j2
$$;
revoke execute on function app.board_rows(date, date, text[]) from public, anon, authenticated;

create or replace function public.board(p_kind text, p_month date)
returns table (rep_id uuid, first_name text, last_name text, dealership text, is_securitas boolean,
               rmr numeric, install numeric, new_logos integer, points integer,
               rmr_rank integer, install_rank integer, new_logo_rank integer, points_rank integer,
               score integer, overall_rank integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_kind not in ('month', 'ytd') then raise exception 'Invalid board.'; end if;
  if not app.is_super_admin()
     and not exists (select 1 from public.months where month_start = p_month and status = 'finalized') then
    return;
  end if;
  return query select * from app.board_rows(case when p_kind = 'ytd' then date_trunc('year', p_month)::date else p_month end, p_month, app.tiebreak_order(p_month));
end $$;

create or replace function public.cronus_trip(p_month date)
returns table (slot integer, reason text, rep_id uuid, first_name text, last_name text, dealership text, is_securitas boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  picked uuid[] := '{}';
  b record;
  n integer := 0;
  cat text; i integer;
  y date := date_trunc('year', p_month)::date;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if not app.is_super_admin()
     and not exists (select 1 from public.months where month_start = p_month and status = 'finalized') then
    return;
  end if;
  select * into b from app.board_rows(y, p_month, app.tiebreak_order(p_month)) x where x.overall_rank is not null order by x.overall_rank, x.last_name, x.first_name limit 1;
  if b.rep_id is not null then
    n := n + 1; picked := picked || b.rep_id;
    slot := n; reason := 'Supreme Titan #1'; rep_id := b.rep_id; first_name := b.first_name; last_name := b.last_name; dealership := b.dealership; is_securitas := b.is_securitas;
    return next;
  end if;

  foreach cat in array array['rmr', 'install', 'new_logos', 'points'] loop
    for i in 1..2 loop
      select * into b from app.board_rows(y, p_month, app.tiebreak_order(p_month)) x
       where x.rep_id <> all (picked)
         and (case cat when 'rmr' then x.rmr_rank when 'install' then x.install_rank when 'new_logos' then x.new_logo_rank else x.points_rank end) is not null
       order by (case cat when 'rmr' then x.rmr_rank when 'install' then x.install_rank when 'new_logos' then x.new_logo_rank else x.points_rank end),
                x.last_name, x.first_name
       limit 1;
      exit when b.rep_id is null;
      n := n + 1; picked := picked || b.rep_id;
      slot := n;
      reason := case cat when 'rmr' then 'Top RMR' when 'install' then 'Top Install' when 'new_logos' then 'Top New Logos' else 'Top Sonitrol points' end;
      rep_id := b.rep_id; first_name := b.first_name; last_name := b.last_name; dealership := b.dealership; is_securitas := b.is_securitas;
      return next;
      b := null;
    end loop;
  end loop;

  b := null;
  select * into b from app.board_rows(y, p_month, app.tiebreak_order(p_month)) x
   where x.is_securitas and x.overall_rank is not null and x.rep_id <> all (picked)
   order by x.overall_rank, x.last_name, x.first_name limit 1;
  if b.rep_id is not null then
    n := n + 1;
    slot := n; reason := 'Securitas leader'; rep_id := b.rep_id; first_name := b.first_name; last_name := b.last_name; dealership := b.dealership; is_securitas := b.is_securitas;
    return next;
  end if;
end $$;

create or replace function app.snapshot_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  delete from public.rank_snapshots where period = p_month;
  foreach k in array array['month', 'ytd'] loop
    insert into public.rank_snapshots (period_kind, period, category, rep_id, value, rank)
    select k, p_month, v.category, b.rep_id, v.value, v.rank
    from app.board_rows(case when k = 'ytd' then date_trunc('year', p_month)::date else p_month end, p_month, app.tiebreak_order(p_month)) b
    cross join lateral (values
      ('rmr', b.rmr, b.rmr_rank), ('install', b.install, b.install_rank),
      ('new_logos', b.new_logos::numeric, b.new_logo_rank), ('points', b.points::numeric, b.points_rank),
      ('overall', b.score::numeric, b.overall_rank)
    ) as v (category, value, rank);
  end loop;
end $$;

create or replace function public.finalize_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if not exists (select 1 from public.months where month_start = p_month and status = 'in_audit') then
    raise exception 'Only a month that is in audit can be finalized.';
  end if;
  -- The tie-breaker order in force now is kept with the month, so changing the rules later never re-ranks it.
  update public.months set status = 'finalized', finalized_at = now(), updated_at = now(),
         tiebreak_order = (select value from public.app_settings where key = 'tiebreak_order')
   where month_start = p_month;
  perform app.snapshot_month(p_month);
end $$;

create or replace function public.reopen_month(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'Only the super admin can do that.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason for reopening.'; end if;
  if not exists (select 1 from public.months where month_start = p_month and status = 'finalized') then
    raise exception 'Only a finalized month can be reopened.';
  end if;
  update public.months set status = 'in_audit', finalized_at = null, tiebreak_order = null, updated_at = now() where month_start = p_month;
  delete from public.rank_snapshots where period = p_month;
  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
    values (auth.uid(), 'months', p_month::text, 'REOPEN', jsonb_build_object('reason', trim(p_reason)));
end $$;

