import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// "is the app up, and is the database awake?" Used by the daily keep-alive. Public on purpose, reveals nothing:
// it asks the database a question with the public (anon) key, so no secret is involved.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('health');
  const ok = !error && data === true;
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
