-- Test-only stand-in for what Supabase provides (roles, auth schema, auth.uid()).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Tiny test helpers.
create schema t;
grant usage on schema t to public;
create function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute 'set local role authenticated';
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function t.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function t.eq(label text, sql text, expected bigint) returns void language plpgsql as $$
declare got bigint;
begin
  execute sql into got;
  if got is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, got;
  end if;
  raise notice 'ok: %', label;
end $$;
create function t.throws(label text, sql text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok: % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (expected an error, none raised)', label;
end $$;
grant execute on all functions in schema t to public;
