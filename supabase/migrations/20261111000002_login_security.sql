-- Email login codes and remembered devices. Only the server (service role) touches these.

create table public.login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_user_idx on public.login_codes (user_id, created_at desc);

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index trusted_devices_user_idx on public.trusted_devices (user_id);

-- Row-level security on with no policies: signed-in users cannot read or write these at all.
alter table public.login_codes enable row level security;
alter table public.trusted_devices enable row level security;
revoke all on public.login_codes, public.trusted_devices from anon, authenticated;
