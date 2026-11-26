-- Two ways a private instagram handle could become visible, closed in the database; and one shape for handles.

-- 1. Removing a member switches her handle back to private, so nothing public is waiting if she comes back.
create function public.member_instagram_hide_on_removal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'removed' and old.status is distinct from 'removed' then
    update public.member_instagram set is_public = false where user_id = new.id and is_public;
  end if;
  return new;
end $$;

revoke all on function public.member_instagram_hide_on_removal() from public, anon, authenticated;

create trigger profiles_removed_hides_instagram after update of status on public.profiles
  for each row execute function public.member_instagram_hide_on_removal();

-- members already removed
update public.member_instagram i set is_public = false
  from public.profiles p
 where p.id = i.user_id and p.status = 'removed' and i.is_public;

-- 2. A handle is what instagram allows: letters, digits, dots and underscores, with an optional @ (the same rule the
--    forms use). No blank or invisible text, no links. Old values are cleaned FIRST: a rule that old rows break would
--    block every later change to them, including removing that member.
-- (a value is only trimmed when the result is a good handle: trimming a blank one would break an older rule)
update public.member_instagram set handle = btrim(handle)
 where handle <> btrim(handle) and btrim(handle) ~ '^@?[A-Za-z0-9._]{1,30}$';
delete from public.member_instagram where handle !~ '^@?[A-Za-z0-9._]{1,30}$';

alter table public.member_instagram
  add constraint member_instagram_handle_shape check (handle ~ '^@?[A-Za-z0-9._]{1,30}$');

update public.applications
   set instagram = case when btrim(instagram) ~ '^@?[A-Za-z0-9._]{1,30}$' then btrim(instagram) else '@unknown' end
 where instagram !~ '^@?[A-Za-z0-9._]{1,30}$';
update public.applications
   set invited_by_instagram = case when btrim(invited_by_instagram) ~ '^@?[A-Za-z0-9._]{1,30}$' then btrim(invited_by_instagram) end
 where invited_by_instagram !~ '^@?[A-Za-z0-9._]{1,30}$';

alter table public.applications
  add constraint applications_instagram_shape check (instagram ~ '^@?[A-Za-z0-9._]{1,30}$'),
  add constraint applications_invited_by_shape check (invited_by_instagram is null or invited_by_instagram ~ '^@?[A-Za-z0-9._]{1,30}$');
