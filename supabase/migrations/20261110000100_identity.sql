-- M1: identity, invites, rate limiting. Security rules live here, not in the UI.
-- Every table has RLS on. anon gets nothing. authenticated gets only explicit grants.

------------------------------------------------------------------ lock down defaults
-- Supabase grants new tables/functions to anon + authenticated by default. Turn that off.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

------------------------------------------------------------------ tables
create sequence public.member_no_seq start 1;

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  member_no   integer not null unique default nextval('public.member_no_seq'),
  member_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  name        text not null check (char_length(name) between 1 and 60),
  instagram   text check (instagram is null or char_length(instagram) <= 40),
  area        text check (area is null or char_length(area) <= 60),
  photo_path  text check (photo_path is null or char_length(photo_path) <= 200),
  trains_at   text[] not null default '{}' check (cardinality(trains_at) <= 10),
  likes       text[] not null default '{}' check (cardinality(likes) <= 12),
  bio         text check (bio is null or char_length(bio) <= 280),
  role        text not null default 'member' check (role in ('member', 'admin')),
  status      text not null default 'active' check (status in ('active', 'removed')),
  joined_at   timestamptz not null default now()
);
comment on table public.profiles is 'Member cards. No phone number here: see member_private.';

-- the only place a member's number lives (besides applications). RLS is row-level, so it is its own table.
create table public.member_private (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  whatsapp_e164 text not null unique check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.applications (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 60),
  instagram            text not null check (char_length(instagram) between 1 and 40),
  whatsapp_e164        text not null check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  invited_by_instagram text check (invited_by_instagram is null or char_length(invited_by_instagram) <= 40),
  vouched_by           uuid references public.profiles (id) on delete set null,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at           timestamptz not null default now(),
  decided_at           timestamptz,
  decided_by           uuid references public.profiles (id) on delete set null,
  profile_id           uuid references public.profiles (id) on delete set null
);
create unique index applications_one_pending_per_number on public.applications (whatsapp_e164) where status = 'pending';
create index applications_status_created on public.applications (status, created_at desc);

create table public.invites (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete cascade,
  profile_id     uuid references public.profiles (id) on delete cascade,
  purpose        text not null check (purpose in ('invite', 'reset')),
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  revoked_at     timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint invites_subject check (
    (purpose = 'invite' and application_id is not null and profile_id is null) or
    (purpose = 'reset'  and profile_id is not null and application_id is null)
  ),
  -- invite links live 7 days at most, reset links 24 hours at most (+1 minute clock slack)
  constraint invites_ttl check (
    expires_at > created_at and (
      (purpose = 'invite' and expires_at <= created_at + interval '7 days 1 minute') or
      (purpose = 'reset'  and expires_at <= created_at + interval '24 hours 1 minute')
    )
  )
);
create index invites_application on public.invites (application_id) where application_id is not null;
create index invites_profile on public.invites (profile_id) where profile_id is not null;

create table public.admin_events (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  action     text not null check (char_length(action) <= 60),
  subject    text check (subject is null or char_length(subject) <= 200),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

------------------------------------------------------------------ RLS on, always
alter table public.profiles       enable row level security;
alter table public.member_private enable row level security;
alter table public.applications   enable row level security;
alter table public.invites        enable row level security;
alter table public.admin_events   enable row level security;
alter table public.rate_limits    enable row level security;   -- no policies: service role only

------------------------------------------------------------------ helper functions
create function public.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

-- the admin must be an active admin AND have completed MFA (aal2) in this session
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
     );
$$;

revoke all on function public.is_member() from public, anon;
revoke all on function public.is_admin()  from public, anon;
grant execute on function public.is_member() to authenticated, service_role;
grant execute on function public.is_admin()  to authenticated, service_role;

------------------------------------------------------------------ policies
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using ((public.is_member() and status = 'active') or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_member())
  with check (id = auth.uid());

-- member_private: her own number, or the admin
create policy member_private_select on public.member_private for select to authenticated
  using (public.is_admin() or (user_id = auth.uid() and public.is_member()));

-- applications: admin only (the apply form writes through the server)
create policy applications_select on public.applications for select to authenticated using (public.is_admin());
create policy applications_update on public.applications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- invites: admin can create and see status (never the hash)
create policy invites_select on public.invites for select to authenticated using (public.is_admin());
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

-- admin_events
create policy admin_events_select on public.admin_events for select to authenticated using (public.is_admin());
create policy admin_events_insert on public.admin_events for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

------------------------------------------------------------------ grants (explicit, column-level)
grant select on public.profiles to authenticated;
grant update (name, instagram, area, photo_path, trains_at, likes, bio) on public.profiles to authenticated;

grant select on public.member_private to authenticated;

grant select on public.applications to authenticated;
grant update (status, decided_at, decided_by, profile_id) on public.applications to authenticated;

grant select (id, application_id, profile_id, purpose, expires_at, used_at, revoked_at, created_by, created_at)
  on public.invites to authenticated;                       -- NOT token_hash
grant insert (application_id, profile_id, purpose, token_hash, expires_at, created_by)
  on public.invites to authenticated;

grant select, insert on public.admin_events to authenticated;

grant usage on sequence public.member_no_seq to service_role;

------------------------------------------------------------------ invites: a new link switches off the old one
create function public.invites_revoke_previous() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.invites i
     set revoked_at = now()
   where i.id <> new.id
     and i.used_at is null
     and i.revoked_at is null
     and i.purpose = new.purpose
     and (
       (new.application_id is not null and i.application_id = new.application_id) or
       (new.profile_id is not null and i.profile_id = new.profile_id)
     );
  return new;
end;
$$;
revoke all on function public.invites_revoke_previous() from public, anon, authenticated;
create trigger invites_revoke_previous after insert on public.invites
  for each row execute function public.invites_revoke_previous();

------------------------------------------------------------------ server-only RPCs (service role)
-- single-use + expiry in ONE atomic statement: safe under any number of parallel requests
create function public.claim_invite(p_hash text, p_purpose text)
returns table (id uuid, application_id uuid, profile_id uuid)
language sql security definer set search_path = ''
as $$
  update public.invites i
     set used_at = now()
   where i.token_hash = p_hash
     and i.purpose = p_purpose
     and i.used_at is null
     and i.revoked_at is null
     and i.expires_at > now()
  returning i.id, i.application_id, i.profile_id;
$$;

-- read-only check used to render the join page (does not consume the token)
create function public.peek_invite(p_hash text, p_purpose text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.invites i
     where i.token_hash = p_hash and i.purpose = p_purpose
       and i.used_at is null and i.revoked_at is null and i.expires_at > now()
  );
$$;

-- give the link back when account creation failed after the claim
create function public.release_invite(p_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.invites set used_at = null where id = p_id and used_at is not null;
$$;

-- fixed-window rate limiter: true = allowed, false = over the limit
create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into c;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return c <= p_max;
end;
$$;

revoke all on function public.claim_invite(text, text)         from public, anon, authenticated;
revoke all on function public.peek_invite(text, text)          from public, anon, authenticated;
revoke all on function public.release_invite(uuid)             from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, int, int)   from public, anon, authenticated;
grant execute on function public.claim_invite(text, text)       to service_role;
grant execute on function public.peek_invite(text, text)        to service_role;
grant execute on function public.release_invite(uuid)           to service_role;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
