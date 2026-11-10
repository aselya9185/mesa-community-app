import { createClient } from '@supabase/supabase-js';

// SERVER ONLY. The service role bypasses row level security: only the four approved places may use it
// (apply form, token redeem + account creation, admin auth actions, web push). A test enforces that
// no client component imports this file.
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase service env is missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
