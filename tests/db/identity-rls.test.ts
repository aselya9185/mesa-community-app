import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient,
  cleanup,
  insertInvite,
  makeApplication,
  makeUser,
  newToken,
  serviceClient,
  signIn,
  signInAal2,
  type TestUser,
} from './helpers';

const TABLES = ['profiles', 'member_private', 'applications', 'invites', 'admin_events', 'rate_limits'] as const;

async function rowsOf(c: SupabaseClient, table: string, columns = '*'): Promise<unknown[]> {
  const { data, error } = await c.from(table).select(columns);
  // permission denied (no grant) and zero rows both mean "reads nothing"
  if (error) return [];
  return data ?? [];
}

let member: TestUser;
let otherMember: TestUser;
let removed: TestUser;
let admin: TestUser;
let noProfile: TestUser; // authenticated but never approved
let appId: string;

beforeAll(async () => {
  member = await makeUser({ name: 'mia' });
  otherMember = await makeUser({ name: 'noa' });
  removed = await makeUser({ name: 'gone', status: 'removed' });
  admin = await makeUser({ name: 'boss', role: 'admin' });
  noProfile = await makeUser({ withProfile: false });
  appId = (await makeApplication()).id;
  await insertInvite({ applicationId: appId, purpose: 'invite', token: newToken(), createdBy: admin.id });
});

afterAll(cleanup);

describe('a logged-out visitor reads and writes nothing', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    expect(await rowsOf(anonClient(), table)).toHaveLength(0);
  });

  it('cannot insert an application directly (the apply form goes through the server)', async () => {
    const { error } = await anonClient()
      .from('applications')
      .insert({ name: 'x', instagram: '@x', whatsapp_e164: '+34600000001' });
    expect(error).not.toBeNull();
  });

  it('cannot call the security helpers or rate limiter', async () => {
    const c = anonClient();
    expect((await c.rpc('claim_invite', { p_hash: 'a'.repeat(64), p_purpose: 'invite' })).error).not.toBeNull();
    expect((await c.rpc('rate_limit_hit', { p_key: 'k', p_max: 5, p_window_seconds: 60 })).error).not.toBeNull();
  });
});

describe('an authenticated user who is not an approved member reads nothing', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    const c = await signIn(noProfile);
    expect(await rowsOf(c, table)).toHaveLength(0);
  });
});

describe('a removed member loses access immediately', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    const c = await signIn(removed);
    const rows = await rowsOf(c, table);
    expect(rows).toHaveLength(0);
  });

  it('cannot update her own profile', async () => {
    const c = await signIn(removed);
    await c.from('profiles').update({ bio: 'still here' }).eq('id', removed.id);
    const { data } = await serviceClient().from('profiles').select('bio').eq('id', removed.id).single();
    expect(data?.bio).not.toBe('still here');
  });
});

describe('members', () => {
  it('see active member profiles but never removed ones', async () => {
    const c = await signIn(member);
    const ids = ((await rowsOf(c, 'profiles', 'id')) as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(member.id);
    expect(ids).toContain(otherMember.id);
    expect(ids).not.toContain(removed.id);
  });

  it('cannot see any whatsapp number: not another member’s, not a pending applicant’s', async () => {
    const c = await signIn(member);
    const priv = (await rowsOf(c, 'member_private')) as { user_id: string }[];
    expect(priv.every((r) => r.user_id === member.id)).toBe(true); // at most her own
    expect(priv.map((r) => r.user_id)).not.toContain(otherMember.id);
    expect(await rowsOf(c, 'applications')).toHaveLength(0);
  });

  it('profiles has no phone column at all', async () => {
    const c = await signIn(member);
    const { error } = await c.from('profiles').select('whatsapp_e164');
    expect(error).not.toBeNull();
  });

  it('cannot read invites or admin events', async () => {
    const c = await signIn(member);
    expect(await rowsOf(c, 'invites')).toHaveLength(0);
    expect(await rowsOf(c, 'admin_events')).toHaveLength(0);
  });

  it('can edit her own card', async () => {
    const c = await signIn(member);
    const { error } = await c.from('profiles').update({ bio: 'matcha first' }).eq('id', member.id);
    expect(error).toBeNull();
    const { data } = await serviceClient().from('profiles').select('bio').eq('id', member.id).single();
    expect(data?.bio).toBe('matcha first');
  });

  it('cannot edit someone else’s card', async () => {
    const c = await signIn(member);
    await c.from('profiles').update({ bio: 'hacked' }).eq('id', otherMember.id);
    const { data } = await serviceClient().from('profiles').select('bio').eq('id', otherMember.id).single();
    expect(data?.bio).not.toBe('hacked');
  });

  it.each([
    ['role', { role: 'admin' }],
    ['status', { status: 'removed' }],
    ['member_no', { member_no: 999 }],
    ['member_code', { member_code: 'abcdef123456' }],
  ])('cannot change her own %s', async (_name, patch) => {
    const c = await signIn(member);
    const { error } = await c.from('profiles').update(patch).eq('id', member.id);
    expect(error).not.toBeNull();
  });

  it('cannot insert profiles or delete anyone', async () => {
    const c = await signIn(member);
    expect((await c.from('profiles').insert({ id: noProfile.id, name: 'x' })).error).not.toBeNull();
    await c.from('profiles').delete().eq('id', otherMember.id);
    const { data } = await serviceClient().from('profiles').select('id').eq('id', otherMember.id);
    expect(data).toHaveLength(1);
  });
});

describe('the admin', () => {
  it('without MFA (aal1) reads nothing in the admin area', async () => {
    const c = await signIn(admin);
    expect(await rowsOf(c, 'applications')).toHaveLength(0);
    expect(await rowsOf(c, 'member_private')).toHaveLength(1); // only her own number, as any member
    expect(await rowsOf(c, 'invites')).toHaveLength(0);
    expect(await rowsOf(c, 'admin_events')).toHaveLength(0);
  });

  it('with MFA (aal2) reads applications, numbers and invites', async () => {
    const c = await signInAal2(admin);
    expect((await rowsOf(c, 'applications')).length).toBeGreaterThan(0);
    const nums = (await rowsOf(c, 'member_private')) as { user_id: string }[];
    expect(nums.map((r) => r.user_id)).toContain(otherMember.id);
    expect((await rowsOf(c, 'invites', 'id, purpose, expires_at, used_at')).length).toBeGreaterThan(0);
  });

  it('can never read token hashes, even with MFA', async () => {
    const c = await signInAal2(admin);
    const { error } = await c.from('invites').select('token_hash');
    expect(error).not.toBeNull();
    // `select *` is refused outright (it would include token_hash): always list columns
    expect((await c.from('invites').select('*')).error).not.toBeNull();
    const { data } = await c.from('invites').select('id, purpose, expires_at, used_at, revoked_at');
    for (const row of data ?? []) expect(row).not.toHaveProperty('token_hash');
  });

  it('can create an invite (hash only) and it is bound to the right expiry', async () => {
    const c = await signInAal2(admin);
    const app = await makeApplication();
    const now = Date.now();
    const { error } = await c.from('invites').insert({
      application_id: app.id,
      purpose: 'invite',
      token_hash: 'b'.repeat(64),
      expires_at: new Date(now + 7 * 86400_000).toISOString(),
      created_by: admin.id,
    });
    expect(error).toBeNull();
    // 30 days is rejected by the database
    const bad = await c.from('invites').insert({
      application_id: app.id,
      purpose: 'invite',
      token_hash: 'c'.repeat(64),
      expires_at: new Date(now + 30 * 86400_000).toISOString(),
      created_by: admin.id,
    });
    expect(bad.error).not.toBeNull();
  });

  it('a member cannot create invites', async () => {
    const c = await signIn(member);
    const { error } = await c.from('invites').insert({
      application_id: appId,
      purpose: 'invite',
      token_hash: 'd'.repeat(64),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      created_by: member.id,
    });
    expect(error).not.toBeNull();
  });

  it('can decide an application but cannot rewrite its contact details', async () => {
    const c = await signInAal2(admin);
    const app = await makeApplication();
    expect(
      (await c.from('applications').update({ status: 'approved', decided_by: admin.id, decided_at: new Date().toISOString() }).eq('id', app.id)).error,
    ).toBeNull();
    expect((await c.from('applications').update({ whatsapp_e164: '+34611111111' }).eq('id', app.id)).error).not.toBeNull();
  });
});

describe('data integrity', () => {
  it('rejects malformed phone numbers and one pending request per number', async () => {
    const svc = serviceClient();
    const bad = await svc.from('applications').insert({ name: 'x', instagram: '@x', whatsapp_e164: '0034600000000' });
    expect(bad.error).not.toBeNull();
    const first = await makeApplication();
    const dupe = await svc
      .from('applications')
      .insert({ name: 'again', instagram: '@again', whatsapp_e164: first.phone });
    expect(dupe.error).not.toBeNull();
  });
});
