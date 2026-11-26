import { afterAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loginAllowed, LOGIN_LIMIT } from '../../src/server/login';
import { previewInvite, redeemInvite } from '../../src/server/join';
import { generateToken } from '../../src/server/tokens';
import { anonClient, cleanup, insertInvite, loginEmail, makeApplication, makeUser, randomPhone, serviceClient } from './helpers';

const svc = serviceClient();
const ip = () => ({ ipHash: randomBytes(6).toString('hex') });
const GOOD = 'a-long-enough-password-1';

afterAll(async () => {
  await cleanup();
});

async function approvedApp(extra: Record<string, unknown> = {}) {
  const app = await makeApplication({ name: 'Sofia Reyes', instagram: '@sofia.s', status: 'approved', ...extra });
  const token = generateToken();
  const inviteId = await insertInvite({ applicationId: app.id, purpose: 'invite', token });
  return { ...app, token, inviteId };
}

describe('joining with an invite link', () => {
  it('shows who it is for, without consuming the link', async () => {
    const a = await approvedApp();
    expect(await previewInvite(svc, a.token)).toEqual({ ok: true, purpose: 'invite', firstName: 'sofia' });
    expect(await previewInvite(svc, a.token)).toMatchObject({ ok: true }); // still valid
    expect(await previewInvite(svc, generateToken())).toEqual({ ok: false });
    expect(await previewInvite(svc, 'nope')).toEqual({ ok: false });
  });

  it('creates the account, profile and private number, then can log in with number + password', async () => {
    const a = await approvedApp();
    const r = await redeemInvite(svc, a.token, GOOD, ip());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.phone).toBe(a.phone);
    const { data: prof } = await svc.from('profiles').select('name, role, status').eq('id', r.userId).single();
    expect(prof).toMatchObject({ name: 'Sofia Reyes', role: 'member', status: 'active' });
    // the handle she gave when asking for an invite is kept, but private until she opts in on her card
    const { data: ig } = await svc.from('member_instagram').select('handle, is_public').eq('user_id', r.userId).single();
    expect(ig).toEqual({ handle: '@sofia.s', is_public: false });
    const { data: priv } = await svc.from('member_private').select('whatsapp_e164').eq('user_id', r.userId).single();
    expect(priv?.whatsapp_e164).toBe(a.phone);
    const { data: app } = await svc.from('applications').select('profile_id').eq('id', a.id).single();
    expect(app?.profile_id).toBe(r.userId);
    const login = await anonClient().auth.signInWithPassword({ email: loginEmail(a.phone), password: GOOD });
    expect(login.error).toBeNull();
    await svc.auth.admin.deleteUser(r.userId);
  });

  it('works once only', async () => {
    const a = await approvedApp();
    const first = await redeemInvite(svc, a.token, GOOD, ip());
    expect(first.ok).toBe(true);
    const second = await redeemInvite(svc, a.token, GOOD, ip());
    expect(second).toEqual({ ok: false, error: 'invalid_link' });
    if (first.ok) await svc.auth.admin.deleteUser(first.userId);
  });

  it('a weak password does not burn the link', async () => {
    const a = await approvedApp();
    expect(await redeemInvite(svc, a.token, 'short', ip())).toEqual({ ok: false, error: 'weak_password' });
    expect(await redeemInvite(svc, a.token, 'onlyletters', ip())).toEqual({ ok: false, error: 'weak_password' });
    expect(await redeemInvite(svc, a.token, '12345678', ip())).toEqual({ ok: false, error: 'weak_password' });
    expect(await previewInvite(svc, a.token)).toMatchObject({ ok: true });
    const ok = await redeemInvite(svc, a.token, GOOD, ip());
    expect(ok.ok).toBe(true);
    if (ok.ok) await svc.auth.admin.deleteUser(ok.userId);
  });

  it('if account creation fails the link is given back', async () => {
    const a = await approvedApp();
    // the number already has an auth user, so createUser fails
    const squatter = await svc.auth.admin.createUser({ email: loginEmail(a.phone), password: GOOD, email_confirm: true });
    const r = await redeemInvite(svc, a.token, GOOD, ip());
    expect(r).toEqual({ ok: false, error: 'failed' });
    expect(await previewInvite(svc, a.token)).toMatchObject({ ok: true });
    if (squatter.data.user) await svc.auth.admin.deleteUser(squatter.data.user.id);
  });

  it('refuses a link whose application is not approved any more', async () => {
    const a = await approvedApp();
    await svc.from('applications').update({ status: 'rejected' }).eq('id', a.id);
    expect(await previewInvite(svc, a.token)).toEqual({ ok: false });
    expect((await redeemInvite(svc, a.token, GOOD, ip())).ok).toBe(false);
  });

  it('20 people opening the same link at once: exactly one account', async () => {
    const a = await approvedApp();
    const results = await Promise.all(Array.from({ length: 20 }, () => redeemInvite(svc, a.token, GOOD, ip())));
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    const w = winners[0];
    if (w && w.ok) await svc.auth.admin.deleteUser(w.userId);
  });

  it('is rate limited per network', async () => {
    const same = ip();
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const r = await redeemInvite(svc, generateToken(), GOOD, same);
      if (!r.ok && r.error === 'rate_limited') limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe('a removed member coming back', () => {
  it('is reactivated with the new password; the old password stops working', async () => {
    const gone = await makeUser({ name: 'Returner' });
    await svc.from('profiles').update({ status: 'removed' }).eq('id', gone.id);
    await svc.auth.admin.updateUserById(gone.id, { ban_duration: '876000h' }); // what removal does
    const app = await makeApplication({ name: 'Returner', instagram: '@returner', whatsapp_e164: gone.phone, status: 'approved' });
    const token = generateToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });

    const r = await redeemInvite(svc, token, 'welcome-back-2026', ip());
    expect(r).toMatchObject({ ok: true, purpose: 'invite', userId: gone.id, phone: gone.phone });
    expect((await svc.from('profiles').select('status').eq('id', gone.id).single()).data?.status).toBe('active');
    expect((await svc.from('applications').select('profile_id').eq('id', app.id).single()).data?.profile_id).toBe(gone.id);
    expect((await anonClient().auth.signInWithPassword({ email: loginEmail(gone.phone), password: gone.password })).error).not.toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email: loginEmail(gone.phone), password: 'welcome-back-2026' })).error).toBeNull();
  });

  it('comes back with her instagram private, even if it was public before she was removed', async () => {
    const gone = await makeUser({ name: 'Quiet', instagramPublic: true });
    await svc.from('profiles').update({ status: 'removed' }).eq('id', gone.id);
    // a row left public from before (whatever removal did or did not do): rejoining must still make it private
    await svc.from('member_instagram').update({ is_public: true }).eq('user_id', gone.id);
    const app = await makeApplication({ name: 'Quiet', instagram: '@quiet.again', whatsapp_e164: gone.phone, status: 'approved' });
    const token = generateToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });

    expect((await redeemInvite(svc, token, GOOD, ip())).ok).toBe(true);
    const { data } = await svc.from('member_instagram').select('handle, is_public').eq('user_id', gone.id).single();
    expect(data).toEqual({ handle: '@quiet.again', is_public: false });
  });

  it('an active member cannot be taken over by someone redeeming a link for her number', async () => {
    const active = await makeUser({ name: 'Stay' });
    const app = await makeApplication({ whatsapp_e164: active.phone, status: 'approved' });
    const token = generateToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    expect(await redeemInvite(svc, token, 'attacker-password-1', ip())).toEqual({ ok: false, error: 'failed' });
    expect((await anonClient().auth.signInWithPassword({ email: loginEmail(active.phone), password: active.password })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email: loginEmail(active.phone), password: 'attacker-password-1' })).error).not.toBeNull();
    expect(await previewInvite(svc, token)).toMatchObject({ ok: true }); // link given back
  });
});

describe('a password reset link', () => {
  it('sets a new password, closes the open request, and works once', async () => {
    const m = await makeUser();
    await svc.from('link_requests').insert({ profile_id: m.id });
    const token = generateToken();
    await insertInvite({ profileId: m.id, purpose: 'reset', token });
    expect(await previewInvite(svc, token)).toMatchObject({ ok: true, purpose: 'reset' });

    const r = await redeemInvite(svc, token, 'brand-new-pass-1', ip());
    expect(r).toMatchObject({ ok: true, purpose: 'reset', userId: m.id });
    const old = await anonClient().auth.signInWithPassword({ email: loginEmail(m.phone), password: m.password });
    expect(old.error).not.toBeNull();
    const fresh = await anonClient().auth.signInWithPassword({ email: loginEmail(m.phone), password: 'brand-new-pass-1' });
    expect(fresh.error).toBeNull();
    const { data: open } = await svc.from('link_requests').select('id').eq('profile_id', m.id).is('handled_at', null);
    expect(open ?? []).toHaveLength(0);
    expect(await redeemInvite(svc, token, 'another-pass-123', ip())).toEqual({ ok: false, error: 'invalid_link' });
  });

  it('does nothing for a removed member', async () => {
    const m = await makeUser({ status: 'removed' });
    const token = generateToken();
    await insertInvite({ profileId: m.id, purpose: 'reset', token });
    expect((await redeemInvite(svc, token, 'brand-new-pass-1', ip())).ok).toBe(false);
  });
});

describe('login attempts', () => {
  it(`stop after ${LOGIN_LIMIT.max} tries per number, even from different networks`, async () => {
    const phone = randomPhone();
    const results: boolean[] = [];
    for (let i = 0; i < LOGIN_LIMIT.max + 2; i++) results.push(await loginAllowed(svc, { ipHash: randomBytes(6).toString('hex'), e164: phone }));
    expect(results.slice(0, LOGIN_LIMIT.max).every(Boolean)).toBe(true);
    expect(results.slice(LOGIN_LIMIT.max)).toEqual([false, false]);
  });

  it('stop after the same number of tries from one network, across numbers', async () => {
    const same = randomBytes(6).toString('hex');
    const results: boolean[] = [];
    for (let i = 0; i < LOGIN_LIMIT.max + 1; i++) results.push(await loginAllowed(svc, { ipHash: same, e164: randomPhone() }));
    expect(results[results.length - 1]).toBe(false);
  });
});
