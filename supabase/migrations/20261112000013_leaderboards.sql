-- Leaderboards: monthly boards, Supreme Titan (year to date) and Cronus Trip.
-- Boards are the one deliberate exception to dealership isolation: every signed-in user can read rep name,
-- dealership and category values for finalized months, and nothing else.

-- Category values and ranks for the cards entered between two months (inclusive) ----------------
-- RMR and Install count only on cards with a term of 12+ months that are not Residential.
-- New Logos counts the cards flagged as new logos. Points are the card points (already 0 under 12 months).
-- A rep with 0 in a category has no rank there. Ties: higher RMR, then more new logos, then more points; full ties share a rank.
-- Overall = the four ranks added, lowest leads; only reps ranked in all four are ranked overall.
create function app.board_rows(p_from date, p_to date)
returns table (rep_id uuid, first_name text, last_name text, dealership text, is_securitas boolean,
               rmr numeric, install numeric, new_logos integer, points integer,
               rmr_rank integer, install_rank integer, new_logo_rank integer, points_rank integer,
               score integer, overall_rank integer)
language sql stable security definer set search_path = '' as $$
  with vals as (
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
  ), a as (select rep_id, rank() over (order by rmr desc, nl desc, pts desc) as rk from vals where rmr > 0),
     b as (select rep_id, rank() over (order by install desc, rmr desc, nl desc, pts desc) as rk from vals where install > 0),
     c as (select rep_id, rank() over (order by nl desc, rmr desc, pts desc) as rk from vals where nl > 0),
     e as (select rep_id, rank() over (order by pts desc, rmr desc, nl desc) as rk from vals where pts > 0),
     j as (
       select v.*, a.rk as ra, b.rk as rb, c.rk as rc, e.rk as re,
              case when a.rk is not null and b.rk is not null and c.rk is not null and e.rk is not null then a.rk + b.rk + c.rk + e.rk end as score
       from vals v left join a using (rep_id) left join b using (rep_id) left join c using (rep_id) left join e using (rep_id)
     )
  select j.rep_id, j.first_name, j.last_name, j.dealership, j.is_securitas, j.rmr, j.install, j.nl, j.pts,
         j.ra::integer, j.rb::integer, j.rc::integer, j.re::integer, j.score::integer,
         (case when j.score is not null then rank() over (order by j.score nulls last, j.ra, j.rc, j.re) end)::integer
  from j
$$;

-- The finalized month the landing page shows ----------------------------------------------------
create function public.latest_finalized_month() returns date
language sql stable security definer set search_path = '' as $$
  select max(month_start) from public.months where status = 'finalized'
$$;

-- A board. p_kind is 'month' (that month alone) or 'ytd' (January through that month: Supreme Titan).
-- Everyone sees finalized months only. The super admin can also preview a month that is still in audit.
create function public.board(p_kind text, p_month date)
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
  return query select * from app.board_rows(case when p_kind = 'ytd' then date_trunc('year', p_month)::date else p_month end, p_month);
end $$;

-- Cronus Trip: 10 spots from the year-to-date rankings, filled in this order. Anyone already picked is skipped
-- and the next person in that category moves up. A rep with no rank in a category cannot be picked from it.
--   Supreme Titan #1, top 2 RMR, top 2 Install, top 2 New Logos, top 2 Sonitrol points, best Securitas rep in Supreme Titan.
create function public.cronus_trip(p_month date)
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
  select * into b from app.board_rows(y, p_month) x where x.overall_rank is not null order by x.overall_rank, x.last_name, x.first_name limit 1;
  if b.rep_id is not null then
    n := n + 1; picked := picked || b.rep_id;
    slot := n; reason := 'Supreme Titan #1'; rep_id := b.rep_id; first_name := b.first_name; last_name := b.last_name; dealership := b.dealership; is_securitas := b.is_securitas;
    return next;
  end if;

  foreach cat in array array['rmr', 'install', 'new_logos', 'points'] loop
    for i in 1..2 loop
      select * into b from app.board_rows(y, p_month) x
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
  select * into b from app.board_rows(y, p_month) x
   where x.is_securitas and x.overall_rank is not null and x.rep_id <> all (picked)
   order by x.overall_rank, x.last_name, x.first_name limit 1;
  if b.rep_id is not null then
    n := n + 1;
    slot := n; reason := 'Securitas leader'; rep_id := b.rep_id; first_name := b.first_name; last_name := b.last_name; dealership := b.dealership; is_securitas := b.is_securitas;
    return next;
  end if;
end $$;

revoke execute on function public.latest_finalized_month(), public.board(text, date), public.cronus_trip(date) from public, anon;
grant execute on function public.latest_finalized_month(), public.board(text, date), public.cronus_trip(date) to authenticated;
revoke execute on function app.board_rows(date, date) from public, anon, authenticated;

-- Rank history: each finalized month's ranks are saved so they can be looked back on ------------
create table public.rank_snapshots (
  period_kind text not null check (period_kind in ('month', 'ytd')),
  period date not null,                       -- the month (for 'ytd': the last month it covers)
  category text not null check (category in ('rmr', 'install', 'new_logos', 'points', 'overall')),
  rep_id uuid not null references public.reps (id),
  value numeric,                              -- null for the overall score of a rep who is not ranked overall
  rank integer,
  primary key (period_kind, period, category, rep_id)
);
alter table public.rank_snapshots enable row level security;
create policy rank_snapshots_read on public.rank_snapshots for select to authenticated using (true);

create function app.snapshot_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  delete from public.rank_snapshots where period = p_month;
  foreach k in array array['month', 'ytd'] loop
    insert into public.rank_snapshots (period_kind, period, category, rep_id, value, rank)
    select k, p_month, v.category, b.rep_id, v.value, v.rank
    from app.board_rows(case when k = 'ytd' then date_trunc('year', p_month)::date else p_month end, p_month) b
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
  update public.months set status = 'finalized', finalized_at = now(), updated_at = now() where month_start = p_month;
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
  update public.months set status = 'in_audit', finalized_at = null, updated_at = now() where month_start = p_month;
  delete from public.rank_snapshots where period = p_month;
  insert into public.audit_log (actor_id, table_name, row_key, action, new_row)
    values (auth.uid(), 'months', p_month::text, 'REOPEN', jsonb_build_object('reason', trim(p_reason)));
end $$;
