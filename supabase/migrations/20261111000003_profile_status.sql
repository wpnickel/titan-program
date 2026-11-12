-- Invite and sign-in status for each person. Written only by the server; readable by super admins.
-- Kept out of the profiles table so routine sign-ins do not fill the audit log with profile changes.

create table public.profile_status (
  profile_id uuid primary key references public.profiles (id),
  invited_at timestamptz,
  last_login_at timestamptz
);

alter table public.profile_status enable row level security;
create policy profile_status_read on public.profile_status for select to authenticated
  using (app.is_super_admin());
revoke insert, update, delete on public.profile_status from anon, authenticated;
revoke select on public.profile_status from anon;
