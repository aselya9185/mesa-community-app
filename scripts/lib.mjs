import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// Dev scripts talk to Supabase with the service role. Local stack by default; for a real
// project set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell (never commit them).
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|host\.docker\.internal)(:|\/|$)/;

/**
 * Service-role client. Pass { localOnly: true } for development-only scripts (seed, door list): they refuse to run
 * against anything but the local stack, so sample data can never land in a real project by accident.
 */
export function service({ localOnly = false } = {}) {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const env = Object.fromEntries(
      out
        .split('\n')
        .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
    url = url ?? env.API_URL;
    key = key ?? env.SERVICE_ROLE_KEY;
  }
  if (!url || !key) throw new Error('no supabase url/key: is `npx supabase start` running?');
  if (localOnly && !LOCAL.test(url)) {
    throw new Error(`this script is for the local development database only, but NEXT_PUBLIC_SUPABASE_URL points at ${new URL(url).host}. unset NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this shell and try again.`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const loginEmail = (phone) => `${phone.replace(/\D/g, '')}@members.mesa.invalid`;

/** create (or reuse) an auth user + profile + private number. Returns the user id. */
export async function upsertMember(svc, { phone, password, name, instagram, instagramPublic = false, role = 'member', area = null, likes = [], trains_at = [], bio = null }) {
  // checked before anything is created, so a typo never leaves a half-made account
  if (instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(instagram)) throw new Error('instagram must be a handle like @name, not a link');
  const email = loginEmail(phone);
  let id;
  const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    const { data } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', phone).maybeSingle();
    if (!data) throw created.error;
    id = data.user_id;
    await svc.auth.admin.updateUserById(id, { password });
  } else {
    id = created.data.user.id;
  }
  const p = await svc.from('profiles').upsert({ id, name, role, status: 'active', area, likes, trains_at, bio });
  if (p.error) throw p.error;
  if (instagram) {
    // the handle lives in its own table: private unless instagramPublic
    const ig = await svc.from('member_instagram').upsert({ user_id: id, handle: instagram, is_public: instagramPublic }, { onConflict: 'user_id' });
    if (ig.error) throw ig.error;
  }
  const m = await svc.from('member_private').upsert({ user_id: id, whatsapp_e164: phone });
  if (m.error) throw m.error;
  return id;
}
