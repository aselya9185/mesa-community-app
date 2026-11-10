import type { SupabaseClient } from '@supabase/supabase-js';

export const LOGIN_LIMIT = { max: 10, windowSeconds: 900 }; // 10 tries per 15 minutes

/** false = too many attempts: stop before even asking Supabase Auth */
export async function loginAllowed(svc: SupabaseClient, ctx: { ipHash: string; e164: string | null }): Promise<boolean> {
  const keys = [`login:ip:${ctx.ipHash}`];
  if (ctx.e164) keys.push(`login:num:${ctx.e164}`);
  let ok = true;
  for (const key of keys) {
    const { data, error } = await svc.rpc('rate_limit_hit', { p_key: key, p_max: LOGIN_LIMIT.max, p_window_seconds: LOGIN_LIMIT.windowSeconds });
    if (error) throw new Error(`rate limiter failed: ${error.message}`);
    if (data !== true) ok = false; // keep counting every key, so one attacker cannot probe the other
  }
  return ok;
}
