-- M3: plans, who is going, who the host removed. All writes go through RPCs; members only ever read.
-- A plan is any outing: no capacity, no spots. (Booking, the free +1 and the poll arrive next.)

------------------------------------------------------------------ tables
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 80),
  starts_at     timestamptz not null,
  place_name    text not null check (char_length(place_name) between 1 and 120),
  maps_url      text check (maps_url is null or (maps_url ~ '^https?://' and char_length(maps_url) <= 500)),
  booking_url   text check (booking_url is null or (booking_url ~ '^https?://' and char_length(booking_url) <= 500)),
  free_plus_one boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);
create index plans_feed on public.plans (starts_at) where status = 'active';
create index plans_host on public.plans (host_id, created_at desc);

create table public.plan_members (
  plan_id      uuid not null references public.plans (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index plan_members_user on public.plan_members (user_id);

create table public.plan_removals (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table public.plans         enable row level security;
alter table public.plan_members  enable row level security;
alter table public.plan_removals enable row level security;

------------------------------------------------------------------ helpers (security definer: no RLS recursion)
create function public.is_plan_host(pid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.plans p where p.id = pid and p.host_id = auth.uid()); $$;

create function public.is_plan_member(pid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member()
     and exists (select 1 from public.plan_members m where m.plan_id = pid and m.user_id = auth.uid());
$$;

revoke all on function public.is_plan_host(uuid)   from public, anon;
revoke all on function public.is_plan_member(uuid) from public, anon;
grant execute on function public.is_plan_host(uuid)   to authenticated, service_role;
grant execute on function public.is_plan_member(uuid) to authenticated, service_role;

------------------------------------------------------------------ policies (read side)
-- cancelled plans stay visible only to people who were in them (and the host)
create policy plans_select on public.plans for select to authenticated
  using (public.is_member() and (status = 'active' or host_id = auth.uid() or public.is_plan_member(id)));

-- the host edits her own active plan; which columns is decided by the grant below
create policy plans_update_host on public.plans for update to authenticated
  using (public.is_member() and host_id = auth.uid() and status = 'active')
  with check (host_id = auth.uid() and status = 'active');

-- the going list is visible to every member who can see the plan
create policy plan_members_select on public.plan_members for select to authenticated
  using (public.is_member() and exists (select 1 from public.plans p where p.id = plan_id));

create policy plan_removals_select on public.plan_removals for select to authenticated
  using (public.is_plan_host(plan_id));

grant select on public.plans, public.plan_members, public.plan_removals to authenticated;
grant update (title, starts_at, place_name, maps_url, booking_url, free_plus_one) on public.plans to authenticated;
-- no insert/delete grants anywhere: create, join, leave, cancel and remove are RPCs below

------------------------------------------------------------------ edits keep the same rules as creation
create function public.plans_before_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.starts_at is distinct from old.starts_at then
    if new.starts_at <= now() then raise exception 'starts_in_past' using errcode = '22023'; end if;
    if new.starts_at > now() + interval '90 days' then raise exception 'starts_too_far' using errcode = '22023'; end if;
  end if;
  return new;
end;
$$;
create trigger plans_before_update before update on public.plans
  for each row execute function public.plans_before_update();

------------------------------------------------------------------ RPCs (security definer, always check auth.uid())
create function public.create_plan(
  p_title text, p_starts_at timestamptz, p_place_name text,
  p_maps_url text, p_booking_url text, p_free_plus_one boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'starts_in_past' using errcode = '22023'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'starts_too_far' using errcode = '22023'; end if;
  if (select count(*) from public.plans where host_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_plans' using errcode = '54000';
  end if;
  insert into public.plans (host_id, title, starts_at, place_name, maps_url, booking_url, free_plus_one)
  values (me, btrim(p_title), p_starts_at, btrim(p_place_name), nullif(btrim(p_maps_url), ''), nullif(btrim(p_booking_url), ''), coalesce(p_free_plus_one, false))
  returning id into new_id;
  insert into public.plan_members (plan_id, user_id) values (new_id, me);   -- the host is always going
  return new_id;
end;
$$;

create function public.join_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.plans;
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  select * into p from public.plans where id = p_plan;
  if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
  if p.status <> 'active' then raise exception 'plan_cancelled' using errcode = '22023'; end if;
  if p.starts_at <= now() then raise exception 'plan_started' using errcode = '22023'; end if;
  if exists (select 1 from public.plan_removals r where r.plan_id = p_plan and r.user_id = me) then
    raise exception 'removed_by_host' using errcode = '42501';
  end if;
  insert into public.plan_members (plan_id, user_id) values (p_plan, me) on conflict do nothing;
end;
$$;

create function public.leave_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if public.is_plan_host(p_plan) then raise exception 'host_cannot_leave' using errcode = '22023'; end if;
  delete from public.plan_members where plan_id = p_plan and user_id = auth.uid();
end;
$$;

create function public.cancel_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not public.is_plan_host(p_plan) then raise exception 'not_the_host' using errcode = '42501'; end if;
  update public.plans set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
   where id = p_plan and status = 'active';
end;
$$;

create function public.remove_from_plan(p_plan uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not public.is_plan_host(p_plan) then raise exception 'not_the_host' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_host' using errcode = '22023'; end if;
  delete from public.plan_members where plan_id = p_plan and user_id = p_user;
  insert into public.plan_removals (plan_id, user_id) values (p_plan, p_user) on conflict do nothing;
end;
$$;

revoke all on function public.create_plan(text, timestamptz, text, text, text, boolean) from public, anon;
revoke all on function public.join_plan(uuid)               from public, anon;
revoke all on function public.leave_plan(uuid)              from public, anon;
revoke all on function public.cancel_plan(uuid)             from public, anon;
revoke all on function public.remove_from_plan(uuid, uuid)  from public, anon;
grant execute on function public.create_plan(text, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.join_plan(uuid)              to authenticated;
grant execute on function public.leave_plan(uuid)             to authenticated;
grant execute on function public.cancel_plan(uuid)            to authenticated;
grant execute on function public.remove_from_plan(uuid, uuid) to authenticated;
