-- M8: the admin functions. Every one of them checks is_admin() (an active admin who completed MFA),
-- writes an audit row, and never handles a plaintext token: the server sends only the SHA-256 hash.

create function public.admin_log(p_action text, p_subject text) returns void
language sql security definer set search_path = ''
as $$ insert into public.admin_events (admin_id, action, subject) values (auth.uid(), left(p_action, 60), left(p_subject, 200)); $$;
revoke all on function public.admin_log(text, text) from public, anon, authenticated;

create function public.admin_require() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.admin_require() from public, anon, authenticated;

------------------------------------------------------------------ approve / reject / resend
create function public.admin_approve(p_application uuid, p_token_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.applications;
begin
  perform public.admin_require();
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  update public.applications set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = a.id;
  insert into public.invites (application_id, purpose, token_hash, expires_at, created_by)
  values (a.id, 'invite', p_token_hash, now() + interval '7 days', auth.uid());
  update public.link_requests set handled_at = now() where application_id = a.id and handled_at is null;
  perform public.admin_log('approve', 'application ' || a.id);
end;
$$;

-- a lost or unsent link: a fresh one; the earlier one stops working (trigger on invites)
create function public.admin_resend_invite(p_application uuid, p_token_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.applications;
begin
  perform public.admin_require();
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if a.status <> 'approved' or a.profile_id is not null then raise exception 'nothing_to_resend' using errcode = '22023'; end if;
  insert into public.invites (application_id, purpose, token_hash, expires_at, created_by)
  values (a.id, 'invite', p_token_hash, now() + interval '7 days', auth.uid());
  update public.link_requests set handled_at = now() where application_id = a.id and handled_at is null;
  perform public.admin_log('resend_invite', 'application ' || a.id);
end;
$$;

-- reject sends nothing to anyone
create function public.admin_reject(p_application uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.applications;
begin
  perform public.admin_require();
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  update public.applications set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = a.id;
  perform public.admin_log('reject', 'application ' || a.id);
end;
$$;

------------------------------------------------------------------ forgotten password: a 24-hour link
create function public.admin_new_link(p_profile uuid, p_token_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_require();
  if not exists (select 1 from public.profiles where id = p_profile and status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  insert into public.invites (profile_id, purpose, token_hash, expires_at, created_by)
  values (p_profile, 'reset', p_token_hash, now() + interval '24 hours', auth.uid());
  update public.link_requests set handled_at = now() where profile_id = p_profile and handled_at is null;
  perform public.admin_log('new_link', 'member ' || p_profile);
end;
$$;

------------------------------------------------------------------ remove a member from the club
-- Access ends the moment status flips (every policy checks is_member()). The app also bans the auth user.
create function public.admin_remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.profiles;
begin
  perform public.admin_require();
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_yourself' using errcode = '22023'; end if;
  if t.role = 'admin' then raise exception 'cannot_remove_admin' using errcode = '22023'; end if;
  if t.status = 'removed' then return; end if;

  -- plans she hosts are cancelled (the people going are told by the usual triggers)
  update public.plans set status = 'cancelled', cancelled_at = now(), updated_at = now() where host_id = p_user and status = 'active';
  -- she is no longer going to anyone else's plan
  delete from public.plan_members where user_id = p_user and plan_id not in (select id from public.plans where host_id = p_user);

  update public.profiles set status = 'removed' where id = p_user;
  delete from public.push_subscriptions where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.link_requests where profile_id = p_user;
  update public.invites set revoked_at = now() where profile_id = p_user and used_at is null and revoked_at is null;
  perform public.admin_log('remove_member', 'member ' || p_user);
end;
$$;

create function public.admin_resolve_report(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.admin_require();
  update public.reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid() where id = p_report;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  perform public.admin_log('resolve_report', 'report ' || p_report);
end;
$$;

-- the little badge on the door icon: zeros for anyone who is not a verified admin
create function public.admin_counts() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_admin() then jsonb_build_object(
    'requests',      (select count(*) from public.applications where status = 'pending'),
    'link_requests', (select count(*) from public.link_requests where handled_at is null),
    'reports',       (select count(*) from public.reports where status = 'open'))
  else jsonb_build_object('requests', 0, 'link_requests', 0, 'reports', 0) end;
$$;

revoke all on function public.admin_approve(uuid, text)        from public, anon;
revoke all on function public.admin_resend_invite(uuid, text)  from public, anon;
revoke all on function public.admin_reject(uuid)               from public, anon;
revoke all on function public.admin_new_link(uuid, text)       from public, anon;
revoke all on function public.admin_remove_member(uuid)        from public, anon;
revoke all on function public.admin_resolve_report(uuid)       from public, anon;
revoke all on function public.admin_counts()                   from public, anon;
grant execute on function public.admin_approve(uuid, text)       to authenticated;
grant execute on function public.admin_resend_invite(uuid, text) to authenticated;
grant execute on function public.admin_reject(uuid)              to authenticated;
grant execute on function public.admin_new_link(uuid, text)      to authenticated;
grant execute on function public.admin_remove_member(uuid)       to authenticated;
grant execute on function public.admin_resolve_report(uuid)      to authenticated;
grant execute on function public.admin_counts()                  to authenticated;
