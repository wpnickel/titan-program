-- Titan Program foundation: dealerships, reps, logins, permissions, months, audit log.
-- Every table has row-level security on. Nothing is readable unless a policy allows it.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

create type public.role_preset as enum (
  'salesperson_view',      -- Salesperson (view only)
  'salesperson_enters',    -- Salesperson (enters own cards)
  'team_admin',            -- Team Admin (enters for dealership, cannot compete)
  'manager_owner',         -- Manager / Owner (same permissions, title field differs)
  'super_admin'
);

create type public.data_scope as enum ('own', 'dealership', 'assigned', 'all');
create type public.month_status as enum ('open', 'in_audit', 'finalized');

-- Dealerships -----------------------------------------------------------------
create table public.dealerships (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_securitas boolean not null default false,
  salespeople_enter_own_cards boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Reps: the people who compete. Separate from logins so history survives role changes.
create table public.reps (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references public.dealerships (id),
  first_name text not null,
  last_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index reps_dealership_idx on public.reps (dealership_id);

-- Logins: one row per person who can sign in. Never deleted, only deactivated.
create table public.profiles (
  id uuid primary key references auth.users (id),
  email text not null unique,
  first_name text not null,
  last_name text not null,
  title text,
  preset public.role_preset not null,
  scope public.data_scope not null,
  dealership_id uuid references public.dealerships (id),
  rep_id uuid unique references public.reps (id),
  can_enter_own boolean not null default false,
  can_enter_for_dealership boolean not null default false,
  participates_in_rankings boolean not null default false,
  can_report boolean not null default false,
  can_ai_search boolean not null default false,
  can_ai_export boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Team Admin is entry-only: cannot compete and never gets AI.
  constraint team_admin_entry_only check (
    preset <> 'team_admin'
    or (participates_in_rankings = false and can_ai_search = false and can_ai_export = false and rep_id is null)
  ),
  constraint ai_export_needs_search check (can_ai_search or not can_ai_export),
  constraint competing_needs_rep check (not participates_in_rankings or rep_id is not null),
  constraint super_admin_sees_all check (preset <> 'super_admin' or scope = 'all'),
  constraint dealership_scope_needs_home check (scope not in ('own', 'dealership') or dealership_id is not null or preset = 'super_admin')
);

-- Extra dealerships for owners who oversee several (scope = 'assigned').
create table public.profile_dealerships (
  profile_id uuid not null references public.profiles (id),
  dealership_id uuid not null references public.dealerships (id),
  primary key (profile_id, dealership_id)
);

-- Months and their audit state.
create table public.months (
  month_start date primary key check (month_start = date_trunc('month', month_start)::date),
  status public.month_status not null default 'open',
  updated_at timestamptz not null default now()
);

-- App settings (key/value), readable by super admins only.
create table public.app_settings (
  key text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('late_entry_alert_email', 'titan@sonitrol.co');

-- Audit log: append-only record of every change. -----------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  db_role text not null default current_user,
  table_name text not null,
  row_key text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- Helper functions ------------------------------------------------------------
create function app.current_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.id = auth.uid() and p.active
$$;

create function app.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select preset = 'super_admin' from public.profiles where id = auth.uid() and active), false)
$$;

-- Dealerships whose full data this user may see (empty for own-scope users).
create function app.visible_dealership_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.dealerships d
   where exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.scope = 'all')
  union
  select p.dealership_id from public.profiles p
   where p.id = auth.uid() and p.active and p.scope = 'dealership' and p.dealership_id is not null
  union
  select pd.dealership_id from public.profile_dealerships pd
   join public.profiles p on p.id = pd.profile_id
   where p.id = auth.uid() and p.active and p.scope = 'assigned'
$$;

create function app.my_rep_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select rep_id from public.profiles where id = auth.uid() and active
$$;

grant execute on all functions in schema app to authenticated;

-- Audit trigger ---------------------------------------------------------------
create function app.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  k := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'month_start',
                to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'month_start');
  insert into public.audit_log (actor_id, table_name, row_key, action, old_row, new_row)
  values (auth.uid(), tg_table_name, k, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_dealerships after insert or update or delete on public.dealerships
  for each row execute function app.audit_change();
create trigger audit_reps after insert or update or delete on public.reps
  for each row execute function app.audit_change();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function app.audit_change();
create trigger audit_profile_dealerships after insert or update or delete on public.profile_dealerships
  for each row execute function app.audit_change();
create trigger audit_months after insert or update or delete on public.months
  for each row execute function app.audit_change();
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function app.audit_change();

create function app.block_audit_edits() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_edits before update or delete on public.audit_log
  for each row execute function app.block_audit_edits();

-- Row-level security ----------------------------------------------------------
alter table public.dealerships enable row level security;
alter table public.reps enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_dealerships enable row level security;
alter table public.months enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

-- Dealership names are shown on company-wide leaderboards, so any signed-in user may read them.
create policy dealerships_read on public.dealerships for select to authenticated using (true);
create policy dealerships_admin on public.dealerships for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy reps_read on public.reps for select to authenticated
  using (app.is_super_admin() or id = app.my_rep_id() or dealership_id in (select app.visible_dealership_ids()));
create policy reps_admin on public.reps for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (app.is_super_admin() or id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy profile_dealerships_read on public.profile_dealerships for select to authenticated
  using (app.is_super_admin() or profile_id = auth.uid());
create policy profile_dealerships_admin on public.profile_dealerships for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy months_read on public.months for select to authenticated using (true);
create policy months_admin on public.months for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy app_settings_admin on public.app_settings for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

create policy audit_log_read on public.audit_log for select to authenticated
  using (app.is_super_admin());

-- Signed-out visitors get nothing.
revoke all on all tables in schema public from anon;
