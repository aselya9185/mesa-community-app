-- Two ways a private instagram handle could become visible, closed in the database.

-- 1. Removing a member switches her handle back to private, so nothing public is waiting if she comes back.
create function public.member_instagram_hide_on_removal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'removed' and old.status is distinct from 'removed' then
    update public.member_instagram set is_public = false where user_id = new.id;
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

-- 2. A handle is one word: no blank values, spaces, links or doubled @. (Checked for new writes; old rows are kept.)
alter table public.member_instagram
  add constraint member_instagram_handle_shape check (handle ~ '^@?[^[:space:]@/]+$') not valid;
