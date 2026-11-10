-- M5: one realtime chat per plan, for the people going. Members post as themselves (RLS);
-- system messages are written only by triggers.

create table public.plan_messages (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('user', 'system')),
  event      text check (event in ('created', 'join', 'leave', 'removed', 'plus_given', 'plus_open', 'edited', 'cancelled')),
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint plan_messages_shape check (
    (kind = 'user' and event is null) or (kind = 'system' and event is not null and sender_id is null)
  )
);
create index plan_messages_plan on public.plan_messages (plan_id, created_at, id);

alter table public.plan_messages enable row level security;

-- only people who are going read the chat (leave or get removed: gone at once)
create policy plan_messages_select on public.plan_messages for select to authenticated
  using (public.is_plan_member(plan_id));

-- only as yourself, only plain messages, only while the plan is active
create policy plan_messages_insert on public.plan_messages for insert to authenticated
  with check (
    kind = 'user' and event is null and sender_id = auth.uid()
    and public.is_plan_member(plan_id)
    and exists (select 1 from public.plans p where p.id = plan_id and p.status = 'active')
  );

grant select on public.plan_messages to authenticated;
grant insert (plan_id, sender_id, kind, body) on public.plan_messages to authenticated;   -- not `event`

alter publication supabase_realtime add table public.plan_messages;

------------------------------------------------------------------ flood control: 20 a minute per person
create function public.plan_messages_rate_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'user' and (
       select count(*) from public.plan_messages m
        where m.sender_id = new.sender_id and m.kind = 'user' and m.created_at > now() - interval '1 minute'
     ) >= 20 then
    raise exception 'too_fast' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function public.plan_messages_rate_limit() from public, anon, authenticated;
create trigger plan_messages_rate_limit before insert on public.plan_messages
  for each row execute function public.plan_messages_rate_limit();

------------------------------------------------------------------ system messages (triggers; never forgeable)
create function public.first_name_lower(uid uuid) returns text
language sql stable security definer set search_path = ''
as $$ select lower(split_part(btrim(p.name), ' ', 1)) from public.profiles p where p.id = uid; $$;
revoke all on function public.first_name_lower(uuid) from public, anon, authenticated;

create function public.system_message(p_plan uuid, p_event text, p_body text) returns void
language sql security definer set search_path = ''
as $$
  insert into public.plan_messages (plan_id, kind, event, body)
  select p_plan, 'system', p_event, p_body where exists (select 1 from public.plans where id = p_plan);
$$;
revoke all on function public.system_message(uuid, text, text) from public, anon, authenticated;

create function public.sys_plan_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.system_message(new.id, 'created', coalesce(public.first_name_lower(new.host_id), 'someone') || ' dropped this plan');
  return new;
end;
$$;
create trigger sys_plan_created after insert on public.plans for each row execute function public.sys_plan_created();

create function public.sys_plan_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who text := coalesce(public.first_name_lower(new.host_id), 'the host');
begin
  if old.status = 'active' and new.status = 'cancelled' then
    perform public.system_message(new.id, 'cancelled', who || ' cancelled this plan');
  elsif new.status = 'active' and (
          new.title is distinct from old.title or new.starts_at is distinct from old.starts_at
       or new.place_name is distinct from old.place_name or new.maps_url is distinct from old.maps_url
       or new.booking_url is distinct from old.booking_url) then
    perform public.system_message(new.id, 'edited', who || ' edited the plan');
  end if;
  return new;
end;
$$;
create trigger sys_plan_changed after update on public.plans for each row execute function public.sys_plan_changed();

create function public.sys_member_joined() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  nm text := public.first_name_lower(new.user_id);
begin
  if nm is not null and not exists (select 1 from public.plans p where p.id = new.plan_id and p.host_id = new.user_id) then
    perform public.system_message(new.plan_id, 'join', nm || ' is in');
  end if;
  return new;
end;
$$;
create trigger sys_member_joined after insert on public.plan_members for each row execute function public.sys_member_joined();

-- leave vs removed: remove_from_plan records the removal first
create function public.sys_member_left() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  nm text := public.first_name_lower(old.user_id);
begin
  if nm is not null and exists (select 1 from public.plans p where p.id = old.plan_id) then
    if exists (select 1 from public.plan_removals r where r.plan_id = old.plan_id and r.user_id = old.user_id) then
      perform public.system_message(old.plan_id, 'removed', nm || ' was removed from the plan');
    else
      perform public.system_message(old.plan_id, 'leave', nm || ' left');
    end if;
  end if;
  return old;
end;
$$;
create trigger sys_member_left after delete on public.plan_members for each row execute function public.sys_member_left();

-- the +1 messages never name anyone
create function public.sys_plus_one_given() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.system_message(new.plan_id, 'plus_given', 'the free +1 is taken');
  return new;
end;
$$;
create trigger sys_plus_one_given after insert on public.plus_one_grants for each row execute function public.sys_plus_one_given();

create function public.sys_plus_one_open() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.plans p where p.id = old.plan_id and p.status = 'active' and p.free_plus_one) then
    perform public.system_message(old.plan_id, 'plus_open', 'the free +1 is open again');
  end if;
  return old;
end;
$$;
create trigger sys_plus_one_open after delete on public.plus_one_grants for each row execute function public.sys_plus_one_open();

-- record the removal BEFORE the member row goes, so the trigger can tell "removed" from "left"
create or replace function public.remove_from_plan(p_plan uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if not public.is_plan_host(p_plan) then raise exception 'not_the_host' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_host' using errcode = '22023'; end if;
  if exists (select 1 from public.plan_members where plan_id = p_plan and user_id = p_user) then
    insert into public.plan_removals (plan_id, user_id) values (p_plan, p_user) on conflict do nothing;
    delete from public.plan_members where plan_id = p_plan and user_id = p_user;
  end if;
end;
$$;

------------------------------------------------------------------ unread + the chats list
create function public.mark_read(p_plan uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.plan_members set last_read_at = now()
   where plan_id = p_plan and user_id = auth.uid() and public.is_member();
$$;

create function public.my_chats()
returns table (
  plan_id uuid, title text, starts_at timestamptz, status text,
  last_body text, last_kind text, last_sender text, last_at timestamptz, unread bigint
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.title, p.starts_at, p.status,
         lm.body, lm.kind, public.first_name_lower(lm.sender_id), lm.created_at,
         (select count(*) from public.plan_messages m
           where m.plan_id = p.id and m.kind = 'user' and m.sender_id is distinct from auth.uid()
             and m.created_at > pm.last_read_at)
    from public.plan_members pm
    join public.plans p on p.id = pm.plan_id
    left join lateral (
      select m.body, m.kind, m.sender_id, m.created_at from public.plan_messages m
       where m.plan_id = p.id order by m.created_at desc, m.id desc limit 1
    ) lm on true
   where pm.user_id = auth.uid() and public.is_member()
     and (p.status = 'active' or p.cancelled_at > now() - interval '7 days')
     and p.starts_at > now() - interval '2 days'
   order by coalesce(lm.created_at, p.created_at) desc
   limit 50;
$$;

revoke all on function public.mark_read(uuid) from public, anon;
revoke all on function public.my_chats()      from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.my_chats()      to authenticated;

------------------------------------------------------------------ backfill plans that already exist
insert into public.plan_messages (plan_id, kind, event, body, created_at)
select p.id, 'system', 'created', coalesce(public.first_name_lower(p.host_id), 'someone') || ' dropped this plan', p.created_at from public.plans p;
