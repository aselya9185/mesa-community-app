-- An instagram handle is private by default.
-- It moved out of `profiles` (which every member can read) into its own table with its own row rules:
-- she sees her own, the admin sees every one (door list, vouching), and other members see it only when she turns on
-- "show my instagram on my card". Phone numbers were already admin-only (member_private).

create table public.member_instagram (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  handle     text not null check (char_length(handle) between 1 and 40),
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.member_instagram enable row level security;

-- keep every existing handle, private until its owner opts in
insert into public.member_instagram (user_id, handle)
select id, instagram from public.profiles where instagram is not null and btrim(instagram) <> '';

-- the column that every member could read is gone (its column grant and check go with it)
alter table public.profiles drop column instagram;

create policy member_instagram_select on public.member_instagram for select to authenticated
  using (
    public.is_admin()
    or (user_id = auth.uid() and public.is_member())
    or (
      is_public
      and public.is_member()
      and exists (select 1 from public.profiles p where p.id = member_instagram.user_id and p.status = 'active')
    )
  );

create policy member_instagram_insert on public.member_instagram for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());

create policy member_instagram_update on public.member_instagram for update to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid());

create policy member_instagram_delete on public.member_instagram for delete to authenticated
  using (user_id = auth.uid() and public.is_member());

-- explicit, column-level grants: she can set her handle and the switch, nothing else
revoke all on public.member_instagram from public, anon;
grant select on public.member_instagram to authenticated;
grant insert (user_id, handle, is_public) on public.member_instagram to authenticated;
grant update (handle, is_public) on public.member_instagram to authenticated;
grant delete on public.member_instagram to authenticated;

create function public.member_instagram_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger member_instagram_touch before update on public.member_instagram
  for each row execute function public.member_instagram_touch();
