-- "I didn't get my link" / "forgot my password": a flag for the door list.
-- Nothing is ever sent or shown to the requester: the admin sends a fresh link by hand.

create table public.link_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete cascade,
  profile_id     uuid references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  handled_at     timestamptz,
  constraint link_requests_subject check (
    (application_id is not null and profile_id is null) or (application_id is null and profile_id is not null)
  )
);
-- one open request per person: asking twice changes nothing
create unique index link_requests_open_application on public.link_requests (application_id)
  where handled_at is null and application_id is not null;
create unique index link_requests_open_profile on public.link_requests (profile_id)
  where handled_at is null and profile_id is not null;

alter table public.link_requests enable row level security;

create policy link_requests_select on public.link_requests for select to authenticated using (public.is_admin());
create policy link_requests_update on public.link_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.link_requests to authenticated;
grant update (handled_at) on public.link_requests to authenticated;
-- inserts happen on the server (service role) after the requester re-confirms her details
