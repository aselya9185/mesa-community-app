-- M7: report and block.
-- Block = hide her chat messages from me and mute pings about her. She is never told.
-- Report = goes to the admin only. The reporter and the reported cannot read it.

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  plan_id     uuid references public.plans (id) on delete set null,
  reason      text not null check (reason in ('uncomfortable', 'spam_or_fake', 'no_show', 'other')),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index reports_open on public.reports (created_at desc) where status = 'open';

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

create policy blocks_select on public.blocks for select to authenticated using (public.is_member() and blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (public.is_member() and blocker_id = auth.uid());
grant select, delete on public.blocks to authenticated;

-- reports: the admin (with MFA) reads and resolves. Nobody else, including the reporter, reads them.
create policy reports_select on public.reports for select to authenticated using (public.is_admin());
create policy reports_update on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.reports to authenticated;

------------------------------------------------------------------ RPCs
create function public.block_member(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_block_yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
end;
$$;

create function public.unblock_member(p_user uuid) returns void
language sql security definer set search_path = ''
as $$ delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user and public.is_member(); $$;

create function public.report_member(p_user uuid, p_reason text, p_note text default null, p_plan uuid default null, p_block boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_report_yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if p_plan is not null and not public.is_plan_member(p_plan) then raise exception 'bad_plan' using errcode = '42501'; end if;
  if (select count(*) from public.reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_reports' using errcode = '54000';
  end if;
  insert into public.reports (reporter_id, reported_id, plan_id, reason, note)
  values (auth.uid(), p_user, p_plan, p_reason, nullif(btrim(coalesce(p_note, '')), ''));
  if p_block then
    insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.block_member(uuid)                               from public, anon;
revoke all on function public.unblock_member(uuid)                             from public, anon;
revoke all on function public.report_member(uuid, text, text, uuid, boolean)   from public, anon;
grant execute on function public.block_member(uuid)                             to authenticated;
grant execute on function public.unblock_member(uuid)                           to authenticated;
grant execute on function public.report_member(uuid, text, text, uuid, boolean) to authenticated;

------------------------------------------------------------------ what a block does
-- 1) her messages disappear from my view of the chat (realtime follows the same policy)
drop policy plan_messages_select on public.plan_messages;
create policy plan_messages_select on public.plan_messages for select to authenticated
  using (
    public.is_plan_member(plan_id)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = plan_messages.sender_id)
  );

-- 2) ...and from my unread counts and the chats list preview
create or replace function public.my_chats()
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
             and m.created_at > pm.last_read_at
             and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id))
    from public.plan_members pm
    join public.plans p on p.id = pm.plan_id
    left join lateral (
      select m.body, m.kind, m.sender_id, m.created_at from public.plan_messages m
       where m.plan_id = p.id
         and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id)
       order by m.created_at desc, m.id desc limit 1
    ) lm on true
   where pm.user_id = auth.uid() and public.is_member()
     and (p.status = 'active' or p.cancelled_at > now() - interval '7 days')
     and p.starts_at > now() - interval '2 days'
   order by coalesce(lm.created_at, p.created_at) desc
   limit 50;
$$;

-- 3) no pings about her: her new plans, her joining my plan, her chat messages
create or replace function public.notify_plan_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  data jsonb := jsonb_build_object('actor', coalesce(public.first_name_lower(new.host_id), 'someone'), 'title', new.title, 'starts_at', new.starts_at);
begin
  insert into public.notifications (user_id, type, plan_id, data)
  select p.id, 'new_plan', new.id, data from public.profiles p
   where p.status = 'active' and p.id <> new.host_id
     and not exists (select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = new.host_id);
  return new;
end;
$$;

create or replace function public.notify_member_joined() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.plans;
begin
  select * into p from public.plans where id = new.plan_id;
  if found and p.host_id <> new.user_id
     and not exists (select 1 from public.blocks b where b.blocker_id = p.host_id and b.blocked_id = new.user_id) then
    perform public.notify(p.host_id, 'joined', p.id, jsonb_build_object('actor', coalesce(public.first_name_lower(new.user_id), 'someone'), 'title', p.title));
  end if;
  return new;
end;
$$;

create or replace function public.notify_chat_message() returns trigger
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
     and not exists (select 1 from public.blocks b where b.blocker_id = m.user_id and b.blocked_id = new.sender_id)
  on conflict (user_id, plan_id) where type = 'message' and read_at is null
  do update set
    data = jsonb_build_object('actor', actor, 'title', t, 'preview', preview, 'count', coalesce((n.data ->> 'count')::int, 1) + 1),
    created_at = now();
  return new;
end;
$$;
