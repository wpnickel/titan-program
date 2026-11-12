-- Securitas internal leaderboards: the same boards, ranked among Securitas salespeople only.
-- Only people at a Securitas dealership (and the super admin) can read them. Nobody else can.
drop function app.board_rows(date, date, text[]);
create function app.board_rows(p_from date, p_to date, p_order text[], p_securitas boolean default false)
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
      and (not p_securitas or d.is_securitas)
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
revoke execute on function app.board_rows(date, date, text[], boolean) from public, anon, authenticated;

-- Can this person see the Securitas boards? The super admin, anyone whose own dealership is a Securitas dealership,
-- and managers or owners assigned to one.
create function public.securitas_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_super_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (exists (select 1 from public.dealerships d where d.id = p.dealership_id and d.is_securitas)
        or exists (select 1 from public.profile_dealerships pd join public.dealerships d on d.id = pd.dealership_id
                   where pd.profile_id = p.id and d.is_securitas))
  )
$$;

-- Same as public.board(), but only Securitas reps are listed and every rank is worked out among them.
create function public.securitas_board(p_kind text, p_month date)
returns table (rep_id uuid, first_name text, last_name text, dealership text, is_securitas boolean,
               rmr numeric, install numeric, new_logos integer, points integer,
               rmr_rank integer, install_rank integer, new_logo_rank integer, points_rank integer,
               score integer, overall_rank integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_kind not in ('month', 'ytd') then raise exception 'Invalid board.'; end if;
  if not public.securitas_access() then return; end if;
  if not app.is_super_admin()
     and not exists (select 1 from public.months where month_start = p_month and status = 'finalized') then
    return;
  end if;
  return query select * from app.board_rows(case when p_kind = 'ytd' then date_trunc('year', p_month)::date else p_month end,
                                            p_month, app.tiebreak_order(p_month), true);
end $$;
revoke execute on function public.securitas_access(), public.securitas_board(text, date) from public, anon;
grant execute on function public.securitas_access(), public.securitas_board(text, date) to authenticated;
