-- A harmless question the keep-alive can ask: "are you there?". It reads nothing and reveals nothing.
-- Free Supabase projects pause after a week with no activity; a daily ping from GitHub Actions prevents it.
create function public.health() returns boolean
language sql stable set search_path = ''
as $$ select true; $$;

revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated, service_role;
