-- Demo mode: lets strangers try the app as pre-made fake people, without ever putting real people at risk.
-- Everything here is inert until demo_config.enabled is true, and it refuses to switch on in a database that holds real
-- members. The protections for demo accounts live here, not only in the app, because the public key and a demo session
-- are enough to call the database directly.

------------------------------------------------------------------ the switch and the marks
create table public.demo_config (
  id      integer primary key check (id = 1),
  enabled boolean not null default false
);
insert into public.demo_config (id, enabled) values (1, false);
alter table public.demo_config enable row level security;          -- no policies: server only
revoke all on public.demo_config from public, anon, authenticated;
grant select, update on public.demo_config to service_role;

-- is_demo: any account that exists only for the demo. demo_key: the fixed cast ('member', 'host', 'admin', ...)
alter table public.profiles
  add column is_demo  boolean not null default false,
  add column demo_key text check (demo_key ~ '^[a-z]{2,20}$'),
  add constraint profiles_demo_key_is_demo check (demo_key is null or is_demo);
create unique index profiles_demo_key on public.profiles (demo_key) where demo_key is not null;

-- the server-completed two-step sign-in of the DEMO admin (never the owner's): service role only
create table public.demo_secrets (
  id        integer primary key check (id = 1),
  factor_id uuid not null,
  secret    text not null
);
alter table public.demo_secrets enable row level security;
revoke all on public.demo_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.demo_secrets to service_role;

-- the only numbers the demo may hold: +34 600 000 0xx
create function public.demo_fake_phone(p text) returns boolean
language sql immutable set search_path = ''
as $$ select coalesce(p ~ '^\+346000000[0-9]{2}$', false); $$;
revoke all on function public.demo_fake_phone(text) from public, anon, authenticated;
grant execute on function public.demo_fake_phone(text) to service_role;

create function public.demo_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select enabled from public.demo_config where id = 1), false); $$;
revoke all on function public.demo_enabled() from public, anon, authenticated;
grant execute on function public.demo_enabled() to service_role;

-- is the person calling a demo account? (stays true even if the demo is later switched off)
create function public.is_demo_caller() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_demo); $$;
revoke all on function public.is_demo_caller() from public, anon;
grant execute on function public.is_demo_caller() to authenticated, service_role;

-- never switch on where real members live, or where a real person's request waits: the demo admin reads the door list.
create function public.demo_guard_enable() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.enabled and exists (select 1 from public.profiles where role = 'member' and not is_demo) then
    raise exception 'real_members_present' using errcode = '55000';
  end if;
  if new.enabled and exists (select 1 from public.applications where not public.demo_fake_phone(whatsapp_e164)) then
    raise exception 'real_requests_present' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.demo_guard_enable() from public, anon, authenticated;
create trigger demo_guard_enable before insert or update on public.demo_config
  for each row execute function public.demo_guard_enable();

-- every member account created while the demo runs (for example by opening an invite link) is a demo account.
-- An admin never is, unless the server says so (the cast): a second real admin must stay out of the demo's reach.
create function public.demo_mark_new_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'member' and public.demo_enabled() then new.is_demo := true; end if;
  return new;
end $$;
revoke all on function public.demo_mark_new_profile() from public, anon, authenticated;
create trigger demo_mark_new_profile before insert on public.profiles
  for each row execute function public.demo_mark_new_profile();

-- and while it runs, a real person's request is never stored, whatever the app does
create function public.demo_no_real_requests() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.demo_enabled() and not public.demo_fake_phone(new.whatsapp_e164) then
    raise exception 'demo_no_requests' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.demo_no_real_requests() from public, anon, authenticated;
create trigger demo_no_real_requests before insert or update of whatsapp_e164 on public.applications
  for each row execute function public.demo_no_real_requests();

------------------------------------------------------------------ what a demo account can never do
-- 1. make a password-reset link for anyone but a throwaway demo account (so the demo admin can never take over the
--    owner's account, or the cast)
create function public.demo_protect_invites() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.profile_id is not null and public.is_demo_caller()
     and not exists (select 1 from public.profiles p where p.id = new.profile_id and p.is_demo and p.demo_key is null and p.role = 'member') then
    raise exception 'demo_protected' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.demo_protect_invites() from public, anon, authenticated;
create trigger demo_protect_invites before insert or update on public.invites
  for each row execute function public.demo_protect_invites();

-- 2. change or remove a real account, or remove / re-role one of the cast
create function public.demo_protect_profiles() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_demo_caller() then
    if not old.is_demo then
      raise exception 'demo_protected' using errcode = '42501';
    end if;
    if old.demo_key is not null and (new.status is distinct from old.status or new.role is distinct from old.role) then
      raise exception 'demo_protected' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.demo_protect_profiles() from public, anon, authenticated;
create trigger demo_protect_profiles before update on public.profiles
  for each row execute function public.demo_protect_profiles();

-- 3. register a device for push (no pings from the demo)
create function public.demo_no_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_demo) then
    raise exception 'demo_no_push' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.demo_no_push() from public, anon, authenticated;
create trigger demo_no_push before insert or update on public.push_subscriptions
  for each row execute function public.demo_no_push();

-- 4. upload photos (strangers could put anything there)
create policy demo_no_avatar_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'avatars' or not public.is_demo_caller());
create policy demo_no_avatar_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'avatars' or not public.is_demo_caller())
  with check (bucket_id <> 'avatars' or not public.is_demo_caller());

-- (flooding the feed is already limited for everyone by create_plan: too_many_plans)

-- 5. see or join a real account's plans, or read a real account's private handle or audit log
create policy demo_plans_only on public.plans as restrictive for select to authenticated
  using (not public.is_demo_caller() or exists (select 1 from public.profiles p where p.id = plans.host_id and p.is_demo));

create function public.demo_stay_in_demo() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.is_demo)
     and exists (select 1 from public.plans pl join public.profiles h on h.id = pl.host_id where pl.id = new.plan_id and not h.is_demo) then
    raise exception 'demo_protected' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.demo_stay_in_demo() from public, anon, authenticated;
create trigger demo_stay_in_demo before insert or update of plan_id, user_id on public.plan_members
  for each row execute function public.demo_stay_in_demo();

create policy demo_private_handles on public.member_instagram as restrictive for select to authenticated
  using (is_public or not public.is_demo_caller()
         or exists (select 1 from public.profiles p where p.id = member_instagram.user_id and p.is_demo));
create policy demo_own_audit on public.admin_events as restrictive for select to authenticated
  using (not public.is_demo_caller() or exists (select 1 from public.profiles p where p.id = admin_events.admin_id and p.is_demo));

-- and no pings cross over, either way: real accounts hear nothing about what strangers do in the demo, and demo
-- accounts hear nothing about a real account's plans
create function public.demo_keep_pings_apart() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.plan_id is not null and exists (
    select 1 from public.plans pl
      join public.profiles h on h.id = pl.host_id
      join public.profiles p on p.id = new.user_id
     where pl.id = new.plan_id and h.is_demo is distinct from p.is_demo
  ) then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.demo_keep_pings_apart() from public, anon, authenticated;
create trigger demo_keep_pings_apart before insert on public.notifications
  for each row execute function public.demo_keep_pings_apart();

------------------------------------------------------------------ undoing what visitors did to the logins
-- the accounts visitors can be signed in as: the cast, and members created while the demo ran. Never an admin from
-- outside the cast, whatever else happened to her account.
create function public.demo_account_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$ select id from public.profiles where is_demo and (demo_key is not null or role = 'member'); $$;
revoke all on function public.demo_account_ids() from public, anon, authenticated;

-- Visitors hold real sessions, so with the public key they can set a password, add an authenticator, change the login
-- or store data on it. This takes all of that away from every demo account. p_keep_factor: the server's own.
create function public.demo_scrub_logins(p_keep_factor uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.sessions where user_id in (select public.demo_account_ids());
  delete from auth.one_time_tokens where user_id in (select public.demo_account_ids());
  delete from auth.mfa_factors
   where user_id in (select public.demo_account_ids()) and id is distinct from p_keep_factor;
  delete from auth.identities where provider = 'phone' and user_id in (select public.demo_account_ids());
  update auth.users
     set encrypted_password = '', raw_user_meta_data = '{}'::jsonb, phone = null, phone_confirmed_at = null,
         email_change = '', email_change_token_new = '', email_change_token_current = '', email_change_confirm_status = 0,
         phone_change = '', phone_change_token = '', recovery_token = '', confirmation_token = ''
   where id in (select public.demo_account_ids());
  -- the cast's logins, as written (in two steps, in case a visitor swapped them around)
  update auth.users u set email = u.id || '@demo.mesa.invalid'
    from public.profiles p where p.id = u.id and p.demo_key is not null;
  update auth.users u set email = ltrim(c.phone, '+') || '@members.mesa.invalid'
    from public.profiles p join public.demo_cast() c on c.key = p.demo_key where p.id = u.id;
  update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
    from auth.users u join public.profiles p on p.id = u.id where i.user_id = u.id and i.provider = 'email' and p.demo_key is not null;
end $$;
revoke all on function public.demo_scrub_logins(uuid) from public, anon, authenticated;

-- switching the demo off shuts every demo account, so none of them can reach what comes after
create function public.demo_shut_down() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.demo_scrub_logins(null);
  delete from public.demo_secrets where id = 1;
  delete from public.invites where profile_id in (select public.demo_account_ids())
                                or created_by in (select public.demo_account_ids());
  delete from public.applications where public.demo_fake_phone(whatsapp_e164);
  update public.profiles set status = 'removed' where id in (select public.demo_account_ids()) and status <> 'removed';
  return null;
end $$;
revoke all on function public.demo_shut_down() from public, anon, authenticated;
create trigger demo_shut_down after update on public.demo_config
  for each row when (old.enabled and not new.enabled) execute function public.demo_shut_down();

------------------------------------------------------------------ one sign-in per demo person at a time
-- two visitors finishing the same sign-in at once makes the auth server drop sessions: they queue here instead
create table public.demo_locks (key text primary key, token uuid not null, held_until timestamptz not null);
alter table public.demo_locks enable row level security;
revoke all on public.demo_locks from public, anon, authenticated;

-- take the place if it is free (or its holder ran out of time): returns the ticket to give it back with, else null
create function public.demo_lock(p_key text, p_seconds integer) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare ticket uuid;
begin
  insert into public.demo_locks as l (key, token, held_until)
  values (p_key, gen_random_uuid(), clock_timestamp() + make_interval(secs => p_seconds))
  on conflict (key) do update set token = excluded.token, held_until = excluded.held_until
    where l.held_until < clock_timestamp()
  returning token into ticket;
  return ticket;
end $$;
revoke all on function public.demo_lock(text, integer) from public, anon, authenticated;
grant execute on function public.demo_lock(text, integer) to service_role;

-- only the holder of the ticket frees the place: a slow sign-in cannot free it for the one that followed
create function public.demo_unlock(p_key text, p_token uuid) returns void
language sql security definer set search_path = ''
as $$ delete from public.demo_locks where key = p_key and token = p_token; $$;
revoke all on function public.demo_unlock(text, uuid) from public, anon, authenticated;
grant execute on function public.demo_unlock(text, uuid) to service_role;

------------------------------------------------------------------ the cast (single source of truth, all fake)
create function public.demo_cast()
returns table (key text, name text, phone text, role text, area text, bio text, likes text[], trains_at text[], handle text, handle_public boolean)
language sql immutable set search_path = ''
as $$
  values
    ('member', 'Marta', '+34600000011', 'member', 'Gràcia',      'new in town. here for classes and company.', array['pilates','yoga'],        array['Studio Gràcia'],               '@marta.demo',  true),
    ('host',   'Anna',  '+34600000012', 'member', 'Eixample',    'i book the class, you bring the energy.',    array['zumba','strength'],      array['Studio Poblenou'],             '@anna.demo',   true),
    ('admin',  'Laia',  '+34600000013', 'admin',  'Poblenou',    'i keep the door.',                           array['running','zumba'],       array['Studio Poblenou','Gym Gràcia'],'@laia.demo',   false),
    ('carla',  'Carla', '+34600000021', 'member', 'El Born',     'sunday runs, then pastries.',                array['running'],               array[]::text[],                      '@carla.demo',  true),
    ('nuria',  'Núria', '+34600000022', 'member', 'Sant Antoni', 'markets, matcha, repeat.',                   array['yoga'],                  array[]::text[],                      '@nuria.demo',  false),
    ('julia',  'Júlia', '+34600000023', 'member', 'Poblenou',    'trying every studio once.',                  array['pilates','strength'],    array['Studio Poblenou'],             '@julia.demo',  true),
    ('ona',    'Ona',   '+34600000024', 'member', 'Sarrià',      null,                                         array['zumba'],                 array[]::text[],                      '@ona.demo',    false);
$$;
revoke all on function public.demo_cast() from public, anon, authenticated;
grant execute on function public.demo_cast() to service_role;

------------------------------------------------------------------ one demo plan with its people
create function public.demo_plan(
  p_host text, p_day integer, p_time time, p_title text, p_place text, p_booking text, p_plus boolean, p_going text[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid;
  host uuid := (select id from public.profiles where demo_key = p_host);
  k text;
begin
  insert into public.plans (host_id, title, starts_at, place_name, booking_url, free_plus_one, created_at)
  values (host, p_title, ((((now() at time zone 'Europe/Madrid')::date + p_day) + p_time) at time zone 'Europe/Madrid'),
          p_place, p_booking, p_plus, now() - interval '2 days')
  returning id into pid;
  foreach k in array array_prepend(p_host, p_going) loop
    insert into public.plan_members (plan_id, user_id) select pid, id from public.profiles where demo_key = k;
    if p_booking is not null then
      insert into public.plan_bookings (plan_id, user_id, state) select pid, id, 'not_booked' from public.profiles where demo_key = k;
    end if;
  end loop;
  -- the automatic "is in" lines happened two days ago, in order
  with ordered as (select id, row_number() over (order by created_at, event = 'join', id) n from public.plan_messages where plan_id = pid)
  update public.plan_messages m set created_at = now() - interval '2 days' + (o.n || ' minutes')::interval from ordered o where o.id = m.id;
  return pid;
end $$;
revoke all on function public.demo_plan(text, integer, time, text, text, text, boolean, text[]) from public, anon, authenticated;

create function public.demo_say(p_plan uuid, p_who text, p_ago interval, p_body text) returns void
language sql security definer set search_path = ''
as $$
  insert into public.plan_messages (plan_id, sender_id, kind, body, created_at)
  select p_plan, id, 'user', p_body, now() - p_ago from public.profiles where demo_key = p_who;
$$;
revoke all on function public.demo_say(uuid, text, interval, text) from public, anon, authenticated;

------------------------------------------------------------------ fresh fake data
create function public.demo_reset() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  zumba uuid; run uuid; market uuid; pilates uuid; gone uuid; later uuid;
begin
  perform pg_advisory_xact_lock(hashtext('mesa-demo-reset'));       -- two resets at once would trip over each other
  if not public.demo_enabled() then raise exception 'demo_disabled' using errcode = '55000'; end if;
  if exists (select 1 from public.profiles where role = 'member' and not is_demo) then
    raise exception 'real_members_present' using errcode = '55000';
  end if;
  if (select count(*) from public.profiles p join public.demo_cast() c on c.key = p.demo_key) <> (select count(*) from public.demo_cast()) then
    raise exception 'demo_accounts_missing' using errcode = '55000';
  end if;

  -- 1. clear everything demo people made. Real accounts (the owner) are never touched.
  delete from public.plans where host_id in (select id from public.profiles where is_demo);
  delete from public.plan_messages where sender_id in (select id from public.profiles where is_demo);
  delete from public.plan_members where user_id in (select id from public.profiles where is_demo);
  delete from public.applications where public.demo_fake_phone(whatsapp_e164);
  delete from public.reports where reported_id in (select id from public.profiles where is_demo)
                                or reporter_id in (select id from public.profiles where is_demo);
  delete from public.blocks where blocker_id in (select id from public.profiles where is_demo)
                               or blocked_id in (select id from public.profiles where is_demo);
  delete from public.link_requests where profile_id in (select id from public.profiles where is_demo);
  delete from public.invites where profile_id in (select id from public.profiles where is_demo);
  delete from public.admin_events where admin_id in (select id from public.profiles where is_demo);
  delete from public.notifications where user_id in (select id from public.profiles where is_demo);
  -- accounts visitors created through invite links
  delete from auth.users where id in (select id from public.profiles where is_demo and demo_key is null and role = 'member');
  perform public.demo_scrub_logins((select factor_id from public.demo_secrets where id = 1));

  -- 2. put the cast back as written
  update public.profiles p
     set name = c.name, role = c.role, status = 'active', area = c.area, bio = c.bio, likes = c.likes, trains_at = c.trains_at, photo_path = null
    from public.demo_cast() c where c.key = p.demo_key;
  insert into public.member_instagram (user_id, handle, is_public)
  select p.id, c.handle, c.handle_public from public.profiles p join public.demo_cast() c on c.key = p.demo_key
  on conflict (user_id) do update set handle = excluded.handle, is_public = excluded.is_public;

  -- 3. plans, dated from today
  -- the +1 is still open: switch to the host and give it to marta
  zumba := public.demo_plan('host', 1, '19:00', 'zumba after work', 'Studio Poblenou', 'https://example.com/book', true, array['member','carla','julia']);
  update public.plan_bookings set state = 'booked' where plan_id = zumba and user_id in (select id from public.profiles where demo_key in ('host','carla'));
  perform public.demo_say(zumba, 'host',   interval '26 hours', 'booked! i have one free pass, tell me if you want it 👀');
  perform public.demo_say(zumba, 'carla',  interval '25 hours', 'booked mine too');
  perform public.demo_say(zumba, 'julia',  interval '5 hours',  'i might be a few minutes late tomorrow, save me a spot at the back');
  perform public.demo_say(zumba, 'member', interval '3 hours',  'i have not booked yet… is the pass still free?');
  perform public.demo_say(zumba, 'host',   interval '2 hours',  'it is! one sec');

  run := public.demo_plan('carla', 2, '10:00', 'park run + pastries', 'Parc de la Ciutadella', null, false, array['member','julia','ona']);
  perform public.demo_say(run, 'carla',  interval '20 hours', 'easy 5k, nobody gets left behind');
  perform public.demo_say(run, 'ona',    interval '4 hours',  'which gate do we meet at?');
  perform public.demo_say(run, 'carla',  interval '1 hour',   'the one by the arc');

  market := public.demo_plan('nuria', 3, '12:00', 'market stroll + matcha', 'Mercat de Sant Antoni', null, false, array['host']);
  perform public.demo_say(market, 'nuria', interval '30 hours', 'come hungry');

  -- the +1 already went to júlia
  pilates := public.demo_plan('host', 5, '09:30', 'morning pilates', 'Studio Gràcia', 'https://example.com/book', true, array['julia','nuria']);
  update public.plan_bookings set state = 'booked' where plan_id = pilates and user_id in (select id from public.profiles where demo_key in ('host','nuria'));
  update public.plan_bookings set state = 'covered' where plan_id = pilates and user_id = (select id from public.profiles where demo_key = 'julia');
  insert into public.plus_one_grants (plan_id, user_id) select pilates, id from public.profiles where demo_key = 'julia';
  perform public.demo_say(pilates, 'host', interval '8 hours', 'see you there ✨');

  gone := public.demo_plan('carla', 4, '18:00', 'beach volleyball', 'Bogatell', null, false, array['member','ona']);
  perform public.demo_say(gone, 'carla', interval '6 hours', 'forecast says rain, cancelling. next week!');
  update public.plans set status = 'cancelled', cancelled_at = now() where id = gone;

  -- further than this week: shows only in its host's and joiners' own lists
  later := public.demo_plan('host', 12, '20:00', 'dinner in sant antoni', 'Carrer del Parlament', null, false, array['carla']);

  -- 4. the "plans after" polls
  insert into public.plan_poll_options (plan_id, label, is_custom, added_by)
  select zumba, v.label, v.custom, p.id from (values ('matcha', false, 'host'), ('a walk', false, 'host'), ('tacos', true, 'carla')) v(label, custom, who)
    join public.profiles p on p.demo_key = v.who;
  insert into public.plan_poll_votes (plan_id, user_id, option_id)
  select zumba, p.id, o.id from (values ('host', 'matcha'), ('carla', 'tacos'), ('julia', 'matcha')) v(who, label)
    join public.profiles p on p.demo_key = v.who
    join public.plan_poll_options o on o.plan_id = zumba and o.label = v.label;
  insert into public.plan_poll_options (plan_id, label, is_custom, added_by)
  select run, v.label, false, p.id from (values ('coffee', 'carla'), ('brunch', 'carla')) v(label, who) join public.profiles p on p.demo_key = v.who;

  -- unread messages waiting for marta in the zumba chat
  update public.plan_members set last_read_at = now() - interval '4 hours' where plan_id = zumba and user_id = (select id from public.profiles where demo_key = 'member');

  -- 5. the door list (numbers are in a range reserved for fake data)
  insert into public.applications (name, instagram, whatsapp_e164, invited_by_instagram, vouched_by, status, created_at, decided_at)
  select v.name, v.handle, v.phone, v.invited, (select id from public.profiles where demo_key = v.voucher), v.status,
         now() - v.ago, case when v.status = 'pending' then null else now() - v.ago + interval '2 hours' end
    from (values
      ('Paula',  '@paula.demo',  '+34600000031', null,          'member', 'pending',  interval '2 hours'),
      ('Irene',  '@irene.demo',  '+34600000032', '@carla.demo', null,     'pending',  interval '9 hours'),
      ('Noor',   '@noor.demo',   '+34600000033', null,          null,     'pending',  interval '1 day'),
      ('Berta',  '@berta.demo',  '+34600000034', '@anna.demo',  null,     'approved', interval '3 days'),
      ('Sandra', '@sandra.demo', '+34600000035', null,          null,     'rejected', interval '5 days')
    ) v(name, handle, phone, invited, voucher, status, ago);

  insert into public.reports (reporter_id, reported_id, plan_id, reason, note, created_at)
  select a.id, b.id, run, 'no_show', 'said yes twice and never came', now() - interval '20 hours'
    from public.profiles a, public.profiles b where a.demo_key = 'carla' and b.demo_key = 'ona';

  -- a handful of recent pings per person, not hundreds
  delete from public.notifications n using (
    select id, row_number() over (partition by user_id order by created_at desc, id) rn from public.notifications
     where user_id in (select id from public.profiles where is_demo)
  ) x where n.id = x.id and x.rn > 4;
end $$;
revoke all on function public.demo_reset() from public, anon, authenticated;
grant execute on function public.demo_reset() to service_role;

------------------------------------------------------------------ there is always someone at the door
-- once visitors have decided every request, the next admin gets new (fake) ones
create function public.demo_top_up_requests() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('mesa-demo-reset'));
  if not public.demo_enabled() then raise exception 'demo_disabled' using errcode = '55000'; end if;
  if exists (select 1 from public.applications where status = 'pending' and public.demo_fake_phone(whatsapp_e164)) then return; end if;
  -- the numbers 40-99 are for these: when they run short, drop decided ones that never became an account
  if (select count(*) from generate_series(40, 99) g
       where not exists (select 1 from public.applications a where a.whatsapp_e164 = '+346000000' || g)
         and not exists (select 1 from public.member_private m where m.whatsapp_e164 = '+346000000' || g)) < 3 then
    delete from public.applications where status <> 'pending' and profile_id is null and whatsapp_e164 ~ '^\+346000000[4-9][0-9]$';
  end if;
  insert into public.applications (name, instagram, whatsapp_e164, status, created_at)
  select v.name, v.handle, n.phone, 'pending', now() - (v.pos || ' hours')::interval
    from (values (1, 'Lucía', '@lucia.demo'), (2, 'Emma', '@emma.demo'), (3, 'Sofía', '@sofia.demo')) v(pos, name, handle)
    join (
      select '+346000000' || g as phone, row_number() over (order by g) as pos
        from generate_series(40, 99) g
       where not exists (select 1 from public.applications a where a.whatsapp_e164 = '+346000000' || g)
         and not exists (select 1 from public.member_private m where m.whatsapp_e164 = '+346000000' || g)
    ) n on n.pos = v.pos;
end $$;
revoke all on function public.demo_top_up_requests() from public, anon, authenticated;
grant execute on function public.demo_top_up_requests() to service_role;

------------------------------------------------------------------ every night, only where the demo is on
create function public.demo_reset_nightly() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.demo_enabled() and exists (select 1 from public.profiles where demo_key is not null) then
    perform public.demo_reset();
  end if;
end $$;
revoke all on function public.demo_reset_nightly() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('mesa-demo-reset', '30 3 * * *', 'select public.demo_reset_nightly()');
