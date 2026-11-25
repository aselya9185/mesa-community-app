import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { totp } from './totp';

// Integration helpers: talk to the LOCAL Supabase stack (`npx supabase start`).

type StackEnv = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };

let cached: StackEnv | undefined;

export function stack(): StackEnv {
  if (cached) return cached;
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const map: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m && m[1]) map[m[1]] = m[2] ?? '';
  }
  const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = map;
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error('local supabase is not running: start Docker Desktop, then `npx supabase start`');
  }
  cached = { API_URL, ANON_KEY, SERVICE_ROLE_KEY };
  return cached;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function anonClient(): SupabaseClient {
  const s = stack();
  return createClient(s.API_URL, s.ANON_KEY, noSession);
}

export function serviceClient(): SupabaseClient {
  const s = stack();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, noSession);
}

export function randomPhone(): string {
  // +34 6xx xxx xxx, unique enough per run
  const n = Math.floor(100_000_000 + Math.random() * 899_999_999);
  return `+346${String(n).slice(0, 8)}`;
}

/** the synthetic login email derived from a normalised WhatsApp number */
export function loginEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@members.mesa.invalid`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export type TestUser = { id: string; phone: string; password: string; name: string };

const created: string[] = [];
const createdApplications: string[] = [];

export async function makeUser(opts: {
  role?: 'member' | 'admin';
  status?: 'active' | 'removed';
  name?: string;
  withProfile?: boolean;
  /** show her instagram handle to other members (it is private unless she opts in) */
  instagramPublic?: boolean;
} = {}): Promise<TestUser> {
  const svc = serviceClient();
  const phone = randomPhone();
  const password = `pw-${randomBytes(8).toString('hex')}`;
  const name = opts.name ?? `test-${randomBytes(3).toString('hex')}`;
  const { data, error } = await svc.auth.admin.createUser({
    email: loginEmail(phone),
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;
  created.push(id);
  if (opts.withProfile !== false) {
    const p = await svc.from('profiles').insert({
      id,
      name,
      role: opts.role ?? 'member',
      status: opts.status ?? 'active',
    });
    if (p.error) throw new Error(`profile insert failed: ${p.error.message}`);
    const m = await svc.from('member_private').insert({ user_id: id, whatsapp_e164: phone });
    if (m.error) throw new Error(`member_private insert failed: ${m.error.message}`);
    const ig = await svc.from('member_instagram').insert({ user_id: id, handle: `@${name}`, is_public: opts.instagramPublic ?? false });
    if (ig.error) throw new Error(`member_instagram insert failed: ${ig.error.message}`);
  }
  return { id, phone, password, name };
}

export async function makeApplication(overrides: Record<string, unknown> = {}): Promise<{ id: string; phone: string }> {
  const svc = serviceClient();
  const phone = randomPhone();
  const { data, error } = await svc
    .from('applications')
    .insert({ name: 'applicant', instagram: '@applicant', whatsapp_e164: phone, ...overrides })
    .select('id')
    .single();
  if (error || !data) throw new Error(`application insert failed: ${error?.message}`);
  createdApplications.push(data.id as string);
  return { id: data.id as string, phone };
}

const sessions = new Map<string, SupabaseClient>();
const aal2Sessions = new Map<string, SupabaseClient>();
const totpSecrets = new Map<string, { factorId: string; secret: string }>();

/** password sign-in (aal1). Cached per user: tests only read through it. */
export async function signIn(user: TestUser): Promise<SupabaseClient> {
  const hit = sessions.get(user.id);
  if (hit) return hit;
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: loginEmail(user.phone), password: user.password });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  sessions.set(user.id, c);
  return c;
}

async function verifyTotp(c: SupabaseClient, factorId: string, secret: string): Promise<void> {
  for (const shift of [0, 30_000]) {
    const ch = await c.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) throw new Error(`mfa challenge failed: ${ch.error?.message}`);
    const v = await c.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: totp(secret, Date.now() + shift) });
    if (!v.error) return;
  }
  throw new Error('mfa verify failed');
}

/** sign in and complete real TOTP MFA, so the access token carries aal2. Enrols once per user. */
export async function signInAal2(user: TestUser): Promise<SupabaseClient> {
  const hit = aal2Sessions.get(user.id);
  if (hit) return hit;
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: loginEmail(user.phone), password: user.password });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  let factor = totpSecrets.get(user.id);
  if (!factor) {
    const enroll = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'test' });
    if (enroll.error || !enroll.data) throw new Error(`mfa enroll failed: ${enroll.error?.message}`);
    factor = { factorId: enroll.data.id, secret: enroll.data.totp.secret };
    totpSecrets.set(user.id, factor);
  }
  await verifyTotp(c, factor.factorId, factor.secret);
  aal2Sessions.set(user.id, c);
  return c;
}

export async function cleanup(): Promise<void> {
  const svc = serviceClient();
  if (createdApplications.length) await svc.from('applications').delete().in('id', createdApplications);
  for (const id of created) await svc.auth.admin.deleteUser(id);
  created.length = 0;
  createdApplications.length = 0;
}

/** insert an invite row the way the server does: hash only, never the token */
export async function insertInvite(opts: {
  applicationId?: string;
  profileId?: string;
  purpose: 'invite' | 'reset';
  token: string;
  expiresInSeconds?: number;
  createdBy?: string;
}): Promise<string> {
  const svc = serviceClient();
  const ttl = opts.expiresInSeconds ?? (opts.purpose === 'invite' ? 7 * 86400 : 86400);
  const { data, error } = await svc
    .from('invites')
    .insert({
      application_id: opts.applicationId ?? null,
      profile_id: opts.profileId ?? null,
      purpose: opts.purpose,
      token_hash: sha256(opts.token),
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      created_by: opts.createdBy ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`invite insert failed: ${error?.message}`);
  return data.id as string;
}
