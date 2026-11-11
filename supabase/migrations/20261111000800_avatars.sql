-- M9: member photos. A private bucket: members see each other's photos through short-lived signed
-- addresses, nobody else sees anything, and everyone writes only into her own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])   -- 512 KB, no svg/html
on conflict (id) do update
  set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_member());

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);

-- the path saved on her card can only point into her own folder (nobody can show someone else's photo as hers)
alter table public.profiles
  add constraint profiles_photo_own check (photo_path is null or photo_path like id::text || '/%');
