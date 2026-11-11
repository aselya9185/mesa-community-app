import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, loginEmail, makeApplication, makeUser, newToken, serviceClient, sha256, signIn, signInAal2, type TestUser } from './helpers';

const svc = serviceClient();
const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();

let admin: TestUser, otherAdmin: TestUser, member: TestUser, other: TestUser, third: TestUser, removed: TestUser;
let adminC: SupabaseClient, adminNoMfaC: SupabaseClient, memberC: SupabaseClient, otherC: SupabaseClient, thirdC: SupabaseClient;

beforeAll(async () => {
  [admin, otherAdmin, member, other, third] = await Promise.all([
    makeUser({ role: 'admin', name: 'Boss' }),
    makeUser({ role: 'admin', name: 'Boss2' }),
    makeUser({ name: 'Mia' }),
    makeUser({ name: 'Noa' }),
    makeUser({ name: 'Tess' }),
  ]);
  removed = await makeUser({ status: 'removed', name: 'Gone' });
  adminC = await signInAal2(admin);
  adminNoMfaC = await signIn(otherAdmin); // password only, no MFA
  [memberC, otherC, thirdC] = await Promise.all([signIn(member), signIn(other), signIn(third)]);
});
afterAll(async () => {
  for (const u of [admin, member, other, third]) await svc.from('plans').delete().eq('host_id', u.id);
  await cleanup();
});

const approve = (c: SupabaseClient, app: string, token = newToken()) => c.rpc('admin_approve', { p_application: app, p_token_hash: sha256(token) });
const invitesOf = async (col: 'application_id' | 'profile_id', id: string) =>
  (await svc.from('invites').select('purpose, token_hash, expires_at, created_at, revoked_at, used_at, created_by').eq(col, id).order('created_at')).data ?? [];

describe('only an admin who completed MFA may use the admin functions', () => {
  it.each([
    ['visitor', () => anonClient()],
    ['member', () => memberC],
    ['admin without MFA', () => adminNoMfaC],
  ])('%s is refused', async (_n, who) => {
    const c = who();
    const app = await makeApplication();
    expect((await approve(c, app.id)).error).not.toBeNull();
    expect((await c.rpc('admin_reject', { p_application: app.id })).error).not.toBeNull();
    expect((await c.rpc('admin_resend_invite', { p_application: app.id, p_token_hash: sha256(newToken()) })).error).not.toBeNull();
    expect((await c.rpc('admin_new_link', { p_profile: other.id, p_token_hash: sha256(newToken()) })).error).not.toBeNull();
    expect((await c.rpc('admin_remove_member', { p_user: other.id })).error).not.toBeNull();
    expect((await c.rpc('admin_resolve_report', { p_report: '00000000-0000-0000-0000-000000000000' })).error).not.toBeNull();
    expect((await svc.from('applications').select('status').eq('id', app.id).single()).data?.status).toBe('pending');
    expect((await svc.from('profiles').select('status').eq('id', other.id).single()).data?.status).toBe('active');
  });

  it('the admin counters read zero for everyone else', async () => {
    for (const c of [memberC, adminNoMfaC]) {
      const { data } = await c.rpc('admin_counts');
      expect(data).toEqual({ requests: 0, link_requests: 0, reports: 0 });
    }
  });
});

describe('approving', () => {
  it('approves a pending request and creates a 7-day, single-use invite (hash only)', async () => {
    const app = await makeApplication({ name: 'Nuria' });
    const token = newToken();
    expect((await approve(adminC, app.id, token)).error).toBeNull();
    const { data } = await svc.from('applications').select('status, decided_by, decided_at').eq('id', app.id).single();
    expect(data).toMatchObject({ status: 'approved', decided_by: admin.id });
    expect(data?.decided_at).not.toBeNull();
    const inv = await invitesOf('application_id', app.id);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ purpose: 'invite', token_hash: sha256(token), created_by: admin.id, used_at: null });
    const ttl = new Date(inv[0]!.expires_at as string).getTime() - new Date(inv[0]!.created_at as string).getTime();
    expect(ttl).toBeGreaterThan(6.9 * 86400_000);
    expect(ttl).toBeLessThan(7.1 * 86400_000);
    // and the token works exactly as redeem expects
    const claimed = await svc.rpc('claim_invite', { p_hash: sha256(token), p_purpose: 'invite' });
    expect(claimed.data).toHaveLength(1);
  });

  it('only a pending request can be approved, and only once', async () => {
    const app = await makeApplication();
    await approve(adminC, app.id);
    expect((await approve(adminC, app.id)).error).not.toBeNull();
    const rej = await makeApplication({ status: 'rejected' });
    expect((await approve(adminC, rej.id)).error).not.toBeNull();
    expect((await approve(adminC, '00000000-0000-0000-0000-000000000000')).error).not.toBeNull();
  });

  it('rejects malformed token hashes (never a plaintext token)', async () => {
    const app = await makeApplication();
    expect((await adminC.rpc('admin_approve', { p_application: app.id, p_token_hash: 'plain-token' })).error).not.toBeNull();
    expect((await svc.from('applications').select('status').eq('id', app.id).single()).data?.status).toBe('pending');
  });

  it('closes an open "wants a link" flag', async () => {
    const app = await makeApplication();
    await svc.from('link_requests').insert({ application_id: app.id });
    await approve(adminC, app.id);
    expect(((await svc.from('link_requests').select('id').eq('application_id', app.id).is('handled_at', null)).data ?? []).length).toBe(0);
  });

  it('resending gives a fresh link and switches the old one off', async () => {
    const app = await makeApplication();
    const t1 = newToken();
    await approve(adminC, app.id, t1);
    await svc.from('link_requests').insert({ application_id: app.id });
    const t2 = newToken();
    expect((await adminC.rpc('admin_resend_invite', { p_application: app.id, p_token_hash: sha256(t2) })).error).toBeNull();
    expect((await svc.rpc('claim_invite', { p_hash: sha256(t1), p_purpose: 'invite' })).data ?? []).toHaveLength(0);
    expect((await svc.rpc('claim_invite', { p_hash: sha256(t2), p_purpose: 'invite' })).data).toHaveLength(1);
    expect(((await svc.from('link_requests').select('id').eq('application_id', app.id).is('handled_at', null)).data ?? []).length).toBe(0);
  });

  it('cannot resend for a pending, rejected or already-used request', async () => {
    const pending = await makeApplication();
    expect((await adminC.rpc('admin_resend_invite', { p_application: pending.id, p_token_hash: sha256(newToken()) })).error).not.toBeNull();
    const used = await makeApplication({ status: 'approved', profile_id: member.id });
    expect((await adminC.rpc('admin_resend_invite', { p_application: used.id, p_token_hash: sha256(newToken()) })).error).not.toBeNull();
  });
});

describe('rejecting', () => {
  it('marks a pending request rejected, creates no invite, sends nothing', async () => {
    const app = await makeApplication();
    expect((await adminC.rpc('admin_reject', { p_application: app.id })).error).toBeNull();
    const { data } = await svc.from('applications').select('status, decided_by').eq('id', app.id).single();
    expect(data).toMatchObject({ status: 'rejected', decided_by: admin.id });
    expect(await invitesOf('application_id', app.id)).toHaveLength(0);
    expect((await adminC.rpc('admin_reject', { p_application: app.id })).error).not.toBeNull(); // not pending any more
  });
});

describe('a new login link for a member who forgot her password', () => {
  it('creates a 24-hour reset link, switches off the old one, closes the flag', async () => {
    await svc.from('link_requests').insert({ profile_id: other.id });
    const t1 = newToken();
    const t2 = newToken();
    expect((await adminC.rpc('admin_new_link', { p_profile: other.id, p_token_hash: sha256(t1) })).error).toBeNull();
    expect((await adminC.rpc('admin_new_link', { p_profile: other.id, p_token_hash: sha256(t2) })).error).toBeNull();
    expect((await svc.rpc('claim_invite', { p_hash: sha256(t1), p_purpose: 'reset' })).data ?? []).toHaveLength(0);
    const inv = (await invitesOf('profile_id', other.id)).filter((i) => i.token_hash === sha256(t2))[0]!;
    const ttl = new Date(inv.expires_at as string).getTime() - new Date(inv.created_at as string).getTime();
    expect(ttl).toBeGreaterThan(23.9 * 3600_000);
    expect(ttl).toBeLessThan(24.1 * 3600_000);
    expect(((await svc.from('link_requests').select('id').eq('profile_id', other.id).is('handled_at', null)).data ?? []).length).toBe(0);
  });

  it('is refused for a removed member or an unknown one', async () => {
    expect((await adminC.rpc('admin_new_link', { p_profile: removed.id, p_token_hash: sha256(newToken()) })).error).not.toBeNull();
    expect((await adminC.rpc('admin_new_link', { p_profile: '00000000-0000-0000-0000-000000000000', p_token_hash: sha256(newToken()) })).error).not.toBeNull();
  });
});

describe('removing a member', () => {
  async function setup() {
    const target = await makeUser({ name: 'Doomed' });
    const tc = await signIn(target);
    const host = await makeUser({ name: 'Hostie' });
    const hc = await signIn(host);
    const mk = async (c: SupabaseClient, title: string) =>
      (await c.rpc('create_plan', { p_title: title, p_starts_at: future(), p_place_name: 'Studio', p_maps_url: null, p_booking_url: null, p_free_plus_one: false, p_host_booked: false, p_poll: [] })).data as string;
    const hers = await mk(tc, 'hers');
    await memberC.rpc('join_plan', { p_plan: hers });
    const theirs = await mk(hc, 'theirs');
    await tc.rpc('join_plan', { p_plan: theirs });
    await tc.from('plan_messages').insert({ plan_id: theirs, sender_id: target.id, kind: 'user', body: 'before i go' });
    await tc.rpc('save_push_subscription', { p_endpoint: `https://push.example/${Math.random()}`, p_p256dh: 'p', p_auth: 'a', p_ua: 't' });
    return { target, tc, host, hers, theirs };
  }

  it('ends her access at once: status, memberships, hosted plans, pings, devices', async () => {
    const { target, tc, hers, theirs } = await setup();
    expect((await adminC.rpc('admin_remove_member', { p_user: target.id })).error).toBeNull();
    expect((await svc.from('profiles').select('status').eq('id', target.id).single()).data?.status).toBe('removed');
    // plans she hosted are cancelled; she is no longer going to others
    expect((await svc.from('plans').select('status').eq('id', hers).single()).data?.status).toBe('cancelled');
    expect(((await svc.from('plan_members').select('user_id').eq('plan_id', theirs).eq('user_id', target.id)).data ?? []).length).toBe(0);
    // her old session now reads nothing at all
    for (const t of ['plans', 'profiles', 'plan_messages', 'notifications']) {
      expect(((await tc.from(t).select('*')).data ?? []).length).toBe(0);
    }
    expect((await tc.rpc('create_plan', { p_title: 'x', p_starts_at: future(), p_place_name: 'y', p_maps_url: null, p_booking_url: null, p_free_plus_one: false, p_host_booked: false, p_poll: [] })).error).not.toBeNull();
    expect(((await svc.from('push_subscriptions').select('endpoint').eq('user_id', target.id)).data ?? []).length).toBe(0);
    // what she said stays; the people in her plan were told it was cancelled
    expect(((await svc.from('plan_messages').select('id').eq('plan_id', theirs).eq('body', 'before i go')).data ?? []).length).toBe(1);
    expect(((await svc.from('notifications').select('type').eq('user_id', member.id).eq('plan_id', hers)).data ?? []).map((n) => n.type)).toContain('plan_cancelled');
  });

  it('is idempotent, and refuses yourself, another admin, or someone unknown', async () => {
    const { target } = await setup();
    expect((await adminC.rpc('admin_remove_member', { p_user: target.id })).error).toBeNull();
    expect((await adminC.rpc('admin_remove_member', { p_user: target.id })).error).toBeNull();
    expect((await adminC.rpc('admin_remove_member', { p_user: admin.id })).error).not.toBeNull();
    expect((await adminC.rpc('admin_remove_member', { p_user: otherAdmin.id })).error).not.toBeNull();
    expect((await adminC.rpc('admin_remove_member', { p_user: '00000000-0000-0000-0000-000000000000' })).error).not.toBeNull();
  });

  it('switches off a reset link that was still open', async () => {
    const { target } = await setup();
    const t = newToken();
    await adminC.rpc('admin_new_link', { p_profile: target.id, p_token_hash: sha256(t) });
    await adminC.rpc('admin_remove_member', { p_user: target.id });
    expect((await svc.rpc('claim_invite', { p_hash: sha256(t), p_purpose: 'reset' })).data ?? []).toHaveLength(0);
  });
});

describe('reports', () => {
  it('the admin resolves one through the function; it is logged', async () => {
    await memberC.rpc('report_member', { p_user: third.id, p_reason: 'other', p_note: null, p_plan: null, p_block: false });
    const { data } = await adminC.from('reports').select('id').eq('reported_id', third.id).eq('status', 'open').limit(1).single();
    expect((await adminC.rpc('admin_resolve_report', { p_report: data!.id })).error).toBeNull();
    expect((await svc.from('reports').select('status, resolved_by').eq('id', data!.id).single()).data).toMatchObject({ status: 'resolved', resolved_by: admin.id });
    await svc.from('reports').delete().eq('reported_id', third.id);
  });
});

describe('the audit trail', () => {
  it('records what the admin did, readable only by the admin', async () => {
    const mine = await adminC.from('admin_events').select('action, subject').order('created_at', { ascending: false }).limit(20);
    const actions = (mine.data ?? []).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['approve', 'reject', 'remove_member']));
    for (const c of [memberC, otherC, thirdC, adminNoMfaC, anonClient()]) {
      expect(((await c.from('admin_events').select('id')).data ?? []).length).toBe(0);
    }
    expect(JSON.stringify(mine.data)).not.toMatch(/\+34/); // no phone numbers in the log
  });
});

describe('a removed member can be let back in', () => {
  it('approving her new request keeps working (the join step reactivates her; see join tests)', async () => {
    const app = await makeApplication({ whatsapp_e164: (await svc.from('member_private').select('whatsapp_e164').eq('user_id', removed.id).single()).data!.whatsapp_e164 });
    expect((await approve(adminC, app.id)).error).toBeNull();
    expect(loginEmail('+34600000000')).toContain('@members.mesa.invalid');
  });
});
