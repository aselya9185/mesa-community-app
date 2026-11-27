import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonaKey } from '@/lib/demo';
import { loginEmail } from '@/lib/phone';
import { totp } from './totp';

// SERVER ONLY. Signs a visitor in as one of the fake demo people. `svc` is the service client; `client` is the visitor's
// own cookie client, which receives the session. No password is ever involved, so there is nothing to leak or change.

export const DEMO_ENTRY_LIMIT = { max: 60, windowSeconds: 600 }; // per network: plenty for exploring, not for abuse

type Cast = { key: string; name: string; phone: string; role: 'member' | 'admin' };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOCK_SECONDS = 15; // longer than a sign-in or a setup takes; a crashed one frees itself
const LOCK_WAIT_MS = 8_000; // give up while the host still lets the request answer

/** too many visitors queuing at once: ask them to try again shortly */
export class DemoBusy extends Error {}

/** one at a time per key (a demo person, or the setup), across all server instances */
async function inTurn<T>(svc: SupabaseClient, key: string, work: () => Promise<T>): Promise<T> {
  const until = Date.now() + LOCK_WAIT_MS;
  let ticket: string | null = null;
  for (;;) {
    const { data, error } = await svc.rpc('demo_lock', { p_key: key, p_seconds: LOCK_SECONDS });
    if (error) throw new Error(`demo queue failed: ${error.message}`);
    ticket = data as string | null;
    if (ticket) break;
    if (Date.now() > until) throw new DemoBusy('demo sign in is busy');
    await pause(120 + Math.random() * 120);
  }
  try {
    return await work();
  } finally {
    await svc.rpc('demo_unlock', { p_key: key, p_token: ticket });
  }
}

/** the database switch: without it nothing here does anything, whatever the server setting says */
export async function demoReady(svc: SupabaseClient): Promise<boolean> {
  const { data } = await svc.from('demo_config').select('enabled').eq('id', 1).maybeSingle();
  return data?.enabled === true;
}

export async function demoEntryAllowed(svc: SupabaseClient, ipHash: string): Promise<boolean> {
  const { data, error } = await svc.rpc('rate_limit_hit', { p_key: `demo:ip:${ipHash}`, p_max: DEMO_ENTRY_LIMIT.max, p_window_seconds: DEMO_ENTRY_LIMIT.windowSeconds });
  if (error) throw new Error(`rate limiter failed: ${error.message}`);
  return data === true;
}

async function castProfiles(svc: SupabaseClient): Promise<{ id: string; demo_key: string; status: string }[]> {
  const { data, error } = await svc.from('profiles').select('id, demo_key, status').not('demo_key', 'is', null);
  if (error) throw new Error(`could not read the demo cast: ${error.message}`);
  return (data ?? []) as { id: string; demo_key: string; status: string }[];
}

const castIds = async (svc: SupabaseClient) => new Map((await castProfiles(svc)).map((p) => [p.demo_key, p.id]));

/** create the one person of the cast who does not exist yet (safe when two visitors arrive at once) */
async function createCastMember(svc: SupabaseClient, c: Cast): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await castIds(svc)).has(c.key)) return;
    const created = await svc.auth.admin.createUser({ email: loginEmail(c.phone), password: `${randomBytes(24).toString('base64url')}a1`, email_confirm: true });
    let id = created.data.user?.id;
    if (!id) {
      // the login exists already (an earlier half-finished attempt): reuse it only through its fake number
      const { data } = await svc.from('member_private').select('user_id').eq('whatsapp_e164', c.phone).maybeSingle();
      id = data?.user_id as string | undefined;
    }
    if (!id) {
      await pause(700);
      continue;
    }
    const profile = await svc.from('profiles').upsert({ id, name: c.name, role: c.role, status: 'active', is_demo: true, demo_key: c.key });
    if (profile.error) throw new Error(`demo profile failed: ${profile.error.message}`);
    const number = await svc.from('member_private').upsert({ user_id: id, whatsapp_e164: c.phone });
    if (number.error) throw new Error(`demo number failed: ${number.error.message}`);
    return;
  }
  throw new Error(`could not create the demo account ${c.key}`);
}

/** make sure the cast exists and there is something upcoming to look at. Returns the cast. */
export async function ensureDemo(svc: SupabaseClient): Promise<{ cast: Cast[]; ids: Map<string, string> }> {
  if (!(await demoReady(svc))) throw new Error('demo is not switched on in the database');
  const { data, error } = await svc.rpc('demo_cast');
  if (error) throw new Error(`could not read the cast: ${error.message}`);
  const cast = data as Cast[];
  if (await needsSetup(svc, cast)) {
    // a reset signs everyone in the demo out, so one visitor does it while the others wait, then look again
    await inTurn(svc, 'setup', async () => {
      if (!(await needsSetup(svc, cast))) return;
      const ids = await castIds(svc);
      for (const c of cast.filter((c) => !ids.has(c.key))) await createCastMember(svc, c);
      const reset = await svc.rpc('demo_reset');
      if (reset.error) throw new Error(`demo reset failed: ${reset.error.message}`);
    });
  }
  return { cast, ids: await castIds(svc) };
}

/** new, switched off and on again, or all sample plans in the past (a missed nightly reset) */
async function needsSetup(svc: SupabaseClient, cast: Cast[]): Promise<boolean> {
  const people = await castProfiles(svc);
  if (people.length < cast.length || people.some((p) => p.status !== 'active')) return true;
  const { count, error } = await svc
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gt('starts_at', new Date().toISOString())
    .in('host_id', people.map((p) => p.id));
  if (error) throw new Error(`could not read the demo plans: ${error.message}`);
  return !count;
}

/** 'ok', 'refused' (the code was wrong: the saved secret no longer fits) or 'unavailable' (try again later) */
async function verifyCode(client: SupabaseClient, factorId: string, secret: string): Promise<'ok' | 'refused' | 'unavailable'> {
  // a code can be refused if it was used a moment ago: try the next window too
  for (const shift of [0, 30_000]) {
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) return 'unavailable';
    const result = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: totp(secret, Date.now() + shift) });
    if (!result.error) return 'ok';
    if (result.error.code !== 'mfa_verification_failed') return 'unavailable';
  }
  return 'refused';
}

/**
 * The demo admin's second step, done by the server. Heals itself if a visitor removed the authenticator. Deleting an
 * authenticator signs out everyone who used it, so that happens only when the saved one is gone or no longer fits,
 * never because the auth server had a bad moment.
 */
async function completeTwoStep(svc: SupabaseClient, client: SupabaseClient, userId: string): Promise<boolean> {
  const { data: stored, error } = await svc.from('demo_secrets').select('factor_id, secret').eq('id', 1).maybeSingle();
  const listed = await svc.auth.admin.mfa.listFactors({ userId });
  if (error || listed.error) return false;
  const factors = listed.data?.factors ?? [];
  if (stored && factors.some((f) => f.id === stored.factor_id && f.status === 'verified')) {
    const result = await verifyCode(client, stored.factor_id as string, stored.secret as string);
    if (result !== 'refused') return result === 'ok';
  }
  for (const f of factors) await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `demo ${Date.now()}` });
  if (enrolled.error || !enrolled.data) return false;
  if ((await verifyCode(client, enrolled.data.id, enrolled.data.totp.secret)) !== 'ok') return false;
  const saved = await svc.from('demo_secrets').upsert({ id: 1, factor_id: enrolled.data.id, secret: enrolled.data.totp.secret });
  return !saved.error;
}

/** sign the visitor in as a persona. Throws if it cannot. */
export async function enterDemo(svc: SupabaseClient, client: SupabaseClient, persona: PersonaKey): Promise<{ userId: string }> {
  const { cast, ids } = await ensureDemo(svc);
  const person = cast.find((c) => c.key === persona);
  const userId = ids.get(persona);
  if (!person || !userId) throw new Error('unknown demo person');
  const email = loginEmail(person.phone);

  // A real account on this device is signed out properly. A demo person is NOT: requests already on their way still
  // carry that session, and if it were revoked their answers would clear the cookie of the person switched to, leaving
  // the visitor on the login page. Demo sessions end at the nightly reset.
  const previous = (await client.auth.getUser()).data.user;
  if (previous) {
    const { data } = await svc.from('profiles').select('is_demo').eq('id', previous.id).maybeSingle();
    if (!data?.is_demo) await client.auth.signOut({ scope: 'local' });
  }

  await inTurn(svc, persona, async () => {
    // heal anything a previous visitor did to the login itself
    const { data: current } = await svc.auth.admin.getUserById(userId);
    const banned = !!(current.user as { banned_until?: string } | null)?.banned_until;
    if (current.user?.email !== email || banned) {
      const healed = await svc.auth.admin.updateUserById(userId, { email, email_confirm: true, ban_duration: 'none' });
      if (healed.error) throw new Error(`could not restore the demo login: ${healed.error.message}`);
    }

    let lastError = 'sign in failed';
    for (let attempt = 0; attempt < 4; attempt++) {
      const link = await svc.auth.admin.generateLink({ type: 'magiclink', email });
      if (link.error || !link.data.properties) {
        lastError = link.error?.message ?? lastError;
      } else {
        const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
        if (!verified.error) {
          if (persona !== 'admin' || (await completeTwoStep(svc, client, userId))) return;
          lastError = 'second step failed';
        } else lastError = verified.error.message;
      }
      await pause(250 * (attempt + 1));
    }
    throw new Error(`demo sign in failed: ${lastError}`);
  });

  if (persona === 'admin') {
    const filled = await svc.rpc('demo_top_up_requests');
    if (filled.error) console.error('demo requests not refilled:', filled.error.message);
  }
  return { userId };
}
