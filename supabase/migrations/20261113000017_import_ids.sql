-- Old-system IDs, so history can be imported more than once without creating duplicates.
-- A later, fuller export matches on these IDs and only adds what is missing.
alter table public.dealerships add column legacy_id integer unique;
alter table public.reps add column legacy_id integer unique;
alter table public.profiles add column legacy_id integer unique;

comment on column public.dealerships.legacy_id is 'Dealership ID in the old Titan Program';
comment on column public.reps.legacy_id is 'User ID in the old Titan Program (the salesperson who got credit)';
comment on column public.profiles.legacy_id is 'User ID in the old Titan Program';
