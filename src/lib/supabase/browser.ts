'use client';

import { createBrowserClient } from '@supabase/ssr';

// The signed-in member's browser client (anon key + her own session). Row level security applies to everything it does.
let client: ReturnType<typeof createBrowserClient> | undefined;
export function supabaseBrowser() {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
