-- M4: booking states, the host-assigned free +1, the "plans after" poll.
-- Same rule as before: members read, RPCs write.
-- Decided: booked badges are visible to everyone in the plan. The +1 grant and its recipient are not.

------------------------------------------------------------------ tables
-- one row per going member, only for plans that have a booking link
create table public.plan_bookings (
  plan_id uuid not null,
  user_id uuid not null,
  state   text not null default 'not_booked' check (state in ('not_booked', 'booked', 'covered')),  -- covered = got the +1
  primary key (plan_id, user_id),
  foreign key (plan_id, user_id) references public.plan_members (plan_id, user_id) on delete cascade
);

-- at most one per plan; deleted with the member (leave / removed)
create table public.plus_one_grants (
  plan_id    uuid primary key references public.plans (id) on delete cascade,
  user_id    uuid not null,
  granted_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plan_members (plan_id, user_id) on delete cascade
);

create table public.plan_poll_options (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 30),
  is_custom  boolean not null default false,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, plan_id)
);
create unique index plan_poll_options_label on public.plan_poll_options (plan_id, lower(label));

create table public.plan_poll_votes (
  plan_id    uuid not null,
  user_id    uuid not null,
  option_id  uuid not null,
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id),
  foreign key (plan_id, user_id) references public.plan_members (plan_id, user_id) on delete cascade,
  foreign key (option_id, plan_id) references public.plan_poll_options (id, plan_id) on delete cascade
);

alter table public.plan_bookings     enable row level security;
alter table public.plus_one_grants   enable row level security;
alter table public.plan_poll_options enable row level security;
alter table public.plan_poll_votes   enable row level security;

------------------------------------------------------------------ read policies
-- your own state, or everyone's if you host. Everyone else reads badges through booking_states().
create policy plan_bookings_select on public.plan_bookings for select to authenticated
  using (public.is_member() and (user_id = auth.uid() or public.is_plan_host(plan_id)));

-- the host and the recipient only
create policy plus_one_grants_select on public.plus_one_grants for select to authenticated
  using (public.is_member() and (user_id = auth.uid() or public.is_plan_host(plan_id)));

-- option labels are not secret: any member who can see the plan
create policy poll_options_select on public.plan_poll_options for select to authenticated
  using (public.is_member() and exists (select 1 from public.plans p where p.id = plan_id));

-- your own vote only (counts come from poll_counts)
create policy poll_votes_select on public.plan_poll_votes for select to authenticated
  using (public.is_member() and user_id = auth.uid());

grant select on public.plan_bookings, public.plus_one_grants, public.plan_poll_options, public.plan_poll_votes to authenticated;

------------------------------------------------------------------ keep bookings in step with the plan
create function public.plans_after_update_booking() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.booking_url is null and new.booking_url is not null then
    insert into public.plan_bookings (plan_id, user_id)
    select new.id, m.user_id from public.plan_members m where m.plan_id = new.id
    on conflict do nothing;
  elsif old.booking_url is not null and new.booking_url is null then
    delete from public.plus_one_grants where plan_id = new.id;
    delete from public.plan_bookings where plan_id = new.id;
  end if;
  if old.free_plus_one and not new.free_plus_one then
    update public.plan_bookings b set state = 'not_booked'
     where b.plan_id = new.id and b.state = 'covered';
    delete from public.plus_one_grants where plan_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.plans_after_update_booking() from public, anon, authenticated;
create trigger plans_after_update_booking after update of booking_url, free_plus_one on public.plans
  for each row execute function public.plans_after_update_booking();

------------------------------------------------------------------ helpers
-- clean a list of poll labels: trim, drop blanks, drop duplicates (any case), keep at most 8
create function public.clean_poll_labels(p_labels text[]) returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(label order by ord), '{}')
  from (
    select distinct on (lower(label)) label, ord
    from (
      select btrim(l) as label, ord
      from unnest(coalesce(p_labels, '{}')) with ordinality as t(l, ord)
    ) x
    where label <> '' and char_length(label) <= 30
    order by lower(label), ord
  ) y
  where ord <= 100 and (select true);
$$;

------------------------------------------------------------------ create_plan (new signature: booked + poll)
drop function public.create_plan(text, timestamptz, text, text, text, boolean);

create function public.create_plan(
  p_title text, p_starts_at timestamptz, p_place_name text,
  p_maps_url text, p_booking_url text, p_free_plus_one boolean,
  p_host_booked boolean default false, p_poll text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  booking text := nullif(btrim(p_booking_url), '');
  labels text[];
  defaults constant text[] := array['matcha', 'coffee', 'a walk', 'brunch'];
  l text;
  n integer := 0;
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'starts_in_past' using errcode = '22023'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'starts_too_far' using errcode = '22023'; end if;
  if (select count(*) from public.plans where host_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_plans' using errcode = '54000';
  end if;
  insert into public.plans (host_id, title, starts_at, place_name, maps_url, booking_url, free_plus_one)
  values (me, btrim(p_title), p_starts_at, btrim(p_place_name), nullif(btrim(p_maps_url), ''), booking, coalesce(p_free_plus_one, false))
  returning id into new_id;
  insert into public.plan_members (plan_id, user_id) values (new_id, me);   -- the host is always going
  if booking is not null then
    insert into public.plan_bookings (plan_id, user_id, state)
    values (new_id, me, case when coalesce(p_host_booked, false) then 'booked' else 'not_booked' end);
  end if;

  labels := public.clean_poll_labels(p_poll);
  foreach l in array labels loop
    exit when n >= 8;
    insert into public.plan_poll_options (plan_id, label, is_custom, added_by)
    values (new_id, l, lower(l) <> all (defaults), me);
    n := n + 1;
  end loop;
  return new_id;
end;
$$;
revoke all on function public.create_plan(text, timestamptz, text, text, text, boolean, boolean, text[]) from public, anon;
grant execute on function public.create_plan(text, timestamptz, text, text, text, boolean, boolean, text[]) to authenticated;

------------------------------------------------------------------ join_plan: give her a booking state when the plan has one
create or replace function public.join_plan(p_plan uuid) returns void
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
  if p.booking_url is not null then
    insert into public.plan_bookings (plan_id, user_id) values (p_plan, me) on conflict do nothing;
  end if;
end;
$$;

------------------------------------------------------------------ booking RPCs
create function public.set_booking(p_plan uuid, p_booked boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cur text;
begin
  if not public.is_plan_member(p_plan) then raise exception 'not_in_plan' using errcode = '42501'; end if;
  select state into cur from public.plan_bookings where plan_id = p_plan and user_id = auth.uid();
  if cur is null then raise exception 'no_booking_needed' using errcode = '22023'; end if;
  if cur = 'covered' then raise exception 'covered_by_plus_one' using errcode = '22023'; end if;
  update public.plan_bookings set state = case when p_booked then 'booked' else 'not_booked' end
   where plan_id = p_plan and user_id = auth.uid();
end;
$$;

-- everyone in the plan sees who has booked. "covered" reads as "booked", so the +1 recipient stays hidden.
create function public.booking_states(p_plan uuid) returns table (user_id uuid, state text)
language sql stable security definer set search_path = ''
as $$
  select b.user_id, case when b.state = 'covered' then 'booked' else b.state end
    from public.plan_bookings b
   where b.plan_id = p_plan and public.is_plan_member(p_plan);
$$;

------------------------------------------------------------------ +1 RPCs
create function public.assign_plus_one(p_plan uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.plans;
  cur text;
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not public.is_plan_host(p_plan) then raise exception 'not_the_host' using errcode = '42501'; end if;
  select * into p from public.plans where id = p_plan;
  if p.status <> 'active' then raise exception 'plan_cancelled' using errcode = '22023'; end if;
  if not p.free_plus_one then raise exception 'no_free_plus_one' using errcode = '22023'; end if;
  if p.booking_url is null then raise exception 'no_booking_needed' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'host_cannot_get_it' using errcode = '22023'; end if;
  select state into cur from public.plan_bookings where plan_id = p_plan and user_id = p_user;
  if cur is null then raise exception 'not_going' using errcode = '22023'; end if;
  if cur <> 'not_booked' then raise exception 'already_booked' using errcode = '22023'; end if;
  if exists (select 1 from public.plus_one_grants g where g.plan_id = p_plan) then
    raise exception 'already_given' using errcode = '22023';
  end if;
  insert into public.plus_one_grants (plan_id, user_id) values (p_plan, p_user);
  update public.plan_bookings set state = 'covered' where plan_id = p_plan and user_id = p_user;
end;
$$;

create function public.revoke_plus_one(p_plan uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid;
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not public.is_plan_host(p_plan) then raise exception 'not_the_host' using errcode = '42501'; end if;
  delete from public.plus_one_grants where plan_id = p_plan returning user_id into who;
  if who is not null then
    update public.plan_bookings set state = 'not_booked' where plan_id = p_plan and user_id = who;
  end if;
end;
$$;

-- what THIS caller may know: none | pending | yours | taken (members) ; given | pending | none (host)
create function public.plus_one_status(p_plan uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  p public.plans;
  holder uuid;
begin
  select * into p from public.plans where id = p_plan;
  if not found or not public.is_plan_member(p_plan) or not p.free_plus_one or p.booking_url is null then return 'none'; end if;
  select user_id into holder from public.plus_one_grants where plan_id = p_plan;
  if holder is null then return 'pending'; end if;
  if p.host_id = auth.uid() then return 'given'; end if;
  if holder = auth.uid() then return 'yours'; end if;
  return 'taken';
end;
$$;

------------------------------------------------------------------ poll RPCs
create function public.vote_plan(p_plan uuid, p_option uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_plan_member(p_plan) then raise exception 'not_in_plan' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan and status = 'active') then
    raise exception 'plan_cancelled' using errcode = '22023';
  end if;
  insert into public.plan_poll_votes (plan_id, user_id, option_id) values (p_plan, auth.uid(), p_option)
  on conflict (plan_id, user_id) do update set option_id = excluded.option_id, updated_at = now();
exception when foreign_key_violation then
  raise exception 'bad_option' using errcode = '22023';
end;
$$;

create function public.clear_vote(p_plan uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_plan_member(p_plan) then raise exception 'not_in_plan' using errcode = '42501'; end if;
  delete from public.plan_poll_votes where plan_id = p_plan and user_id = auth.uid();
end;
$$;

create function public.poll_counts(p_plan uuid) returns table (option_id uuid, votes bigint)
language sql stable security definer set search_path = ''
as $$
  select o.id, count(v.user_id)
    from public.plan_poll_options o
    left join public.plan_poll_votes v on v.option_id = o.id and v.plan_id = o.plan_id
   where o.plan_id = p_plan and public.is_plan_member(p_plan)
   group by o.id;
$$;

create function public.add_poll_option(p_plan uuid, p_label text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  lbl text := btrim(coalesce(p_label, ''));
  new_id uuid;
begin
  if not public.is_plan_member(p_plan) then raise exception 'not_in_plan' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan and status = 'active') then
    raise exception 'plan_cancelled' using errcode = '22023';
  end if;
  if char_length(lbl) < 1 or char_length(lbl) > 30 then raise exception 'bad_label' using errcode = '22023'; end if;
  if (select count(*) from public.plan_poll_options where plan_id = p_plan) >= 8 then
    raise exception 'too_many_options' using errcode = '22023';
  end if;
  if exists (select 1 from public.plan_poll_options where plan_id = p_plan and is_custom and added_by = auth.uid()
             and created_at > (select created_at from public.plans where id = p_plan) + interval '1 minute') then
    raise exception 'one_option_each' using errcode = '22023';
  end if;
  insert into public.plan_poll_options (plan_id, label, is_custom, added_by)
  values (p_plan, lbl, true, auth.uid())
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'duplicate_option' using errcode = '22023';
end;
$$;

revoke all on function public.set_booking(uuid, boolean)         from public, anon;
revoke all on function public.booking_states(uuid)               from public, anon;
revoke all on function public.assign_plus_one(uuid, uuid)        from public, anon;
revoke all on function public.revoke_plus_one(uuid)              from public, anon;
revoke all on function public.plus_one_status(uuid)              from public, anon;
revoke all on function public.vote_plan(uuid, uuid)              from public, anon;
revoke all on function public.clear_vote(uuid)                   from public, anon;
revoke all on function public.poll_counts(uuid)                  from public, anon;
revoke all on function public.add_poll_option(uuid, text)        from public, anon;
revoke all on function public.clean_poll_labels(text[])          from public, anon;
grant execute on function public.set_booking(uuid, boolean)      to authenticated;
grant execute on function public.booking_states(uuid)            to authenticated;
grant execute on function public.assign_plus_one(uuid, uuid)     to authenticated;
grant execute on function public.revoke_plus_one(uuid)           to authenticated;
grant execute on function public.plus_one_status(uuid)           to authenticated;
grant execute on function public.vote_plan(uuid, uuid)           to authenticated;
grant execute on function public.clear_vote(uuid)                to authenticated;
grant execute on function public.poll_counts(uuid)               to authenticated;
grant execute on function public.add_poll_option(uuid, text)     to authenticated;
grant execute on function public.clean_poll_labels(text[])       to authenticated, service_role;

------------------------------------------------------------------ backfill plans that existed before M4
insert into public.plan_bookings (plan_id, user_id)
select m.plan_id, m.user_id from public.plan_members m join public.plans p on p.id = m.plan_id
 where p.booking_url is not null
on conflict do nothing;

insert into public.plan_poll_options (plan_id, label, is_custom, added_by)
select p.id, d.label, false, p.host_id from public.plans p cross join (values ('matcha'), ('coffee'), ('a walk'), ('brunch')) as d(label)
 where p.status = 'active' and not exists (select 1 from public.plan_poll_options o where o.plan_id = p.id);
