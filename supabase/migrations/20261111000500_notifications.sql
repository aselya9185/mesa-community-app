-- M6: in-app notifications + the hand-off to web push.
-- Notifications are created only by triggers. Members read, mark read and delete their own.

create extension if not exists pg_net;

------------------------------------------------------------------ tables
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('new_plan', 'joined', 'plus_one', 'message', 'plan_edited', 'plan_cancelled')),
  plan_id    uuid references public.plans (id) on delete cascade,
  data       jsonb not null default '{}',   -- first names, plan title, a message preview: never contact details
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_recent on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;
-- chat messages gather into ONE unread notification per person per plan
create unique index notifications_one_unread_message on public.notifications (user_id, plan_id)
  where type = 'message' and read_at is null;

create table public.push_subscriptions (
  endpoint   text primary key check (endpoint ~ '^https://'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- where the database sends "a notification was created" (set per environment, never in git)
create table public.push_config (
  id     integer primary key check (id = 1),
  url    text not null,
  secret text not null
);

alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_config        enable row level security;   -- no policies: server only

create policy notifications_select on public.notifications for select to authenticated
  using (public.is_member() and user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (public.is_member() and user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (public.is_member() and user_id = auth.uid());

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (public.is_member() and user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (public.is_member() and user_id = auth.uid());

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, delete on public.push_subscriptions to authenticated;

alter publication supabase_realtime add table public.notifications;

------------------------------------------------------------------ saving a device (a device can only belong to one person)
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

------------------------------------------------------------------ creating notifications
create function public.notify(p_user uuid, p_type text, p_plan uuid, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, plan_id, data)
  select p_user, p_type, p_plan, p_data
   where exists (select 1 from public.profiles where id = p_user and status = 'active');
$$;
revoke all on function public.notify(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- a new plan: every active member except the host
create function public.notify_plan_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  data jsonb := jsonb_build_object('actor', coalesce(public.first_name_lower(new.host_id), 'someone'), 'title', new.title, 'starts_at', new.starts_at);
begin
  insert into public.notifications (user_id, type, plan_id, data)
  select p.id, 'new_plan', new.id, data from public.profiles p where p.status = 'active' and p.id <> new.host_id;
  return new;
end;
$$;
create trigger notify_plan_created after insert on public.plans for each row execute function public.notify_plan_created();

-- edited / cancelled: the people going, except the host
create function public.notify_plan_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  kind text;
begin
  if old.status = 'active' and new.status = 'cancelled' then
    kind := 'plan_cancelled';
  elsif new.status = 'active' and (
          new.title is distinct from old.title or new.starts_at is distinct from old.starts_at
       or new.place_name is distinct from old.place_name or new.maps_url is distinct from old.maps_url
       or new.booking_url is distinct from old.booking_url) then
    kind := 'plan_edited';
  else
    return new;
  end if;
  insert into public.notifications (user_id, type, plan_id, data)
  select m.user_id, kind, new.id,
         jsonb_build_object('actor', coalesce(public.first_name_lower(new.host_id), 'the host'), 'title', new.title, 'starts_at', new.starts_at)
    from public.plan_members m join public.profiles p on p.id = m.user_id
   where m.plan_id = new.id and m.user_id <> new.host_id and p.status = 'active';
  return new;
end;
$$;
create trigger notify_plan_changed after update on public.plans for each row execute function public.notify_plan_changed();

-- someone joined: tell the host
create function public.notify_member_joined() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.plans;
begin
  select * into p from public.plans where id = new.plan_id;
  if found and p.host_id <> new.user_id then
    perform public.notify(p.host_id, 'joined', p.id, jsonb_build_object('actor', coalesce(public.first_name_lower(new.user_id), 'someone'), 'title', p.title));
  end if;
  return new;
end;
$$;
create trigger notify_member_joined after insert on public.plan_members for each row execute function public.notify_member_joined();

-- the +1: only the person who got it
create function public.notify_plus_one() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t text;
begin
  select title into t from public.plans where id = new.plan_id;
  perform public.notify(new.user_id, 'plus_one', new.plan_id, jsonb_build_object('title', t));
  return new;
end;
$$;
create trigger notify_plus_one after insert on public.plus_one_grants for each row execute function public.notify_plus_one();

-- chat: the other people in the plan; a run of messages stays ONE unread notification (with a count)
create function public.notify_chat_message() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t text;
  actor text := coalesce(public.first_name_lower(new.sender_id), 'someone');
  preview text := left(new.body, 80);
begin
  if new.kind <> 'user' then return new; end if;
  select title into t from public.plans where id = new.plan_id;
  insert into public.notifications as n (user_id, type, plan_id, data)
  select m.user_id, 'message', new.plan_id, jsonb_build_object('actor', actor, 'title', t, 'preview', preview, 'count', 1)
    from public.plan_members m join public.profiles p on p.id = m.user_id
   where m.plan_id = new.plan_id and m.user_id is distinct from new.sender_id and p.status = 'active'
  on conflict (user_id, plan_id) where type = 'message' and read_at is null
  do update set
    data = jsonb_build_object('actor', actor, 'title', t, 'preview', preview, 'count', coalesce((n.data ->> 'count')::int, 1) + 1),
    created_at = now();
  return new;
end;
$$;
create trigger notify_chat_message after insert on public.plan_messages for each row execute function public.notify_chat_message();

------------------------------------------------------------------ push hand-off (fire and forget: never blocks or breaks a notification)
create function public.push_after_notification() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if found then
    begin
      perform net.http_post(
        url := cfg.url,
        body := jsonb_build_object('notification_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret),
        timeout_milliseconds := 3000
      );
    exception when others then
      null;   -- push is best effort; the in-app notification already exists
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.push_after_notification() from public, anon, authenticated;
create trigger push_after_notification after insert on public.notifications for each row execute function public.push_after_notification();
