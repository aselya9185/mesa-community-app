import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoEntryAllowed, DEMO_ENTRY_LIMIT, ensureDemo, enterDemo } from '../../src/server/demo';
import { demoOn } from './demo-helpers';
import { anonClient, cleanup, loginEmail, makeUser, serviceClient, signIn, type TestUser } from './helpers';

const svc = serviceClient();
const hash = () => randomBytes(32).toString('hex');

let owner: TestUser; // the real admin: created BEFORE the demo is switched on, so she is not a demo account
let off: () => Promise<void>;
let ids: Map<string, string>;

const enter = async (who: 'member' | 'host' | 'admin') => {
  const client = anonClient();
  const { userId } = await enterDemo(svc, client, who);
  return { client, userId };
};
const plan = (title: string) => ({ p_title: title, p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place_name: 'x', p_maps_url: null, p_booking_url: null, p_free_plus_one: false });
const profileOf = async (id: string) => (await svc.from('profiles').select('name, role, status, is_demo, demo_key').eq('id', id).single()).data;

describe('with the demo switched off (every normal database)', () => {
  it('does nothing: no reset, no entry', async () => {
    expect((await svc.rpc('demo_reset')).error?.message).toContain('demo_disabled');
    await expect(ensureDemo(svc)).rejects.toThrow(/not switched on/);
    await expect(enterDemo(svc, anonClient(), 'admin')).rejects.toThrow(/not switched on/);
  });

  it('refuses to switch on while a real member exists', async () => {
    const real = await makeUser({ name: 'reallife' });
    const { error } = await svc.from('demo_config').update({ enabled: true }).eq('id', 1);
    expect(error?.message).toContain('real_members_present');
    await svc.auth.admin.deleteUser(real.id);
  });

  it('nobody but the server can read or switch the demo', async () => {
    const someone = await makeUser({ name: 'curious' });
    for (const c of [anonClient(), await signIn(someone)]) {
      expect((await c.from('demo_config').select('*')).error).not.toBeNull();
      expect((await c.from('demo_secrets').select('*')).error).not.toBeNull();
      expect((await c.from('demo_config').update({ enabled: true }).eq('id', 1)).error).not.toBeNull();
      expect((await c.rpc('demo_reset')).error).not.toBeNull();
      expect((await c.rpc('demo_cast')).error).not.toBeNull();
      for (const [fn, args] of [
        ['demo_lock', { p_key: 'admin', p_seconds: 60 }],
        ['demo_unlock', { p_key: 'admin', p_token: '00000000-0000-4000-8000-000000000000' }],
        ['demo_scrub_logins', { p_keep_factor: null }],
        ['demo_top_up_requests', {}],
      ] as const) {
        // refused for lack of permission, not merely because the demo is off
        expect((await c.rpc(fn, args)).error?.code, fn).toBe('42501');
      }
      expect((await c.from('demo_locks').select('*')).error).not.toBeNull();
    }
    // and nobody can mark herself as a demo person
    const me = await signIn(someone);
    expect((await me.from('profiles').update({ is_demo: true }).eq('id', someone.id)).error).not.toBeNull();
    expect((await me.from('profiles').update({ demo_key: 'admin' }).eq('id', someone.id)).error).not.toBeNull();
    await svc.auth.admin.deleteUser(someone.id);
  });
});

describe('the demo', () => {
  beforeAll(async () => {
    owner = await makeUser({ name: 'owner', role: 'admin' });
    off = await demoOn();
    ({ ids } = await ensureDemo(svc));
  }, 120_000);

  afterAll(async () => {
    await off();
    await cleanup();
  }, 120_000);

  // the demo admin reads the door list, so a real person's request must never sit in a demo database
  it('refuses to switch on while a real invite request is waiting', async () => {
    await svc.from('demo_config').update({ enabled: false }).eq('id', 1);
    const added = await svc.from('applications').insert({ name: 'Real', instagram: '@real', whatsapp_e164: '+34699888777' });
    expect(added.error).toBeNull();
    const { error } = await svc.from('demo_config').update({ enabled: true }).eq('id', 1);
    await svc.from('applications').delete().eq('whatsapp_e164', '+34699888777');
    expect(error?.message).toContain('real_requests_present');
    expect((await svc.from('demo_config').update({ enabled: true }).eq('id', 1)).error).toBeNull();
    await ensureDemo(svc); // switching off shut the cast: the next visit brings it back
  });

  it('never stores a request with a real number while it runs, not even from the server', async () => {
    const real = await svc.from('applications').insert({ name: 'Real', instagram: '@real', whatsapp_e164: '+34699888777' });
    expect(real.error?.message).toContain('demo_no_requests');
    const { data: fake } = await svc.from('applications').select('id').like('whatsapp_e164', '+34600000%').limit(1).single();
    const rewritten = await svc.from('applications').update({ whatsapp_e164: '+34699888777' }).eq('id', fake!.id);
    expect(rewritten.error?.message).toContain('demo_no_requests');
    expect((await svc.from('applications').select('id').eq('whatsapp_e164', '+34699888777')).data).toHaveLength(0);
  });

  it('creates the fake cast with fake numbers, and plans to look at', async () => {
    expect([...ids.keys()].sort()).toEqual(['admin', 'carla', 'host', 'julia', 'member', 'nuria', 'ona']);
    const { data: numbers } = await svc.from('member_private').select('whatsapp_e164').in('user_id', [...ids.values()]);
    expect(numbers).toHaveLength(7);
    for (const n of numbers ?? []) expect(n.whatsapp_e164).toMatch(/^\+346000000\d\d$/);
    const { data: plans } = await svc.from('plans').select('title, status, starts_at').in('host_id', [...ids.values()]);
    expect(plans?.filter((p) => p.status === 'active' && Date.parse(p.starts_at as string) > Date.now()).length).toBeGreaterThanOrEqual(4);
    expect(plans?.some((p) => p.status === 'cancelled')).toBe(true);
    const { data: apps } = await svc.from('applications').select('status').like('whatsapp_e164', '+34600000%');
    expect(apps?.map((a) => a.status).sort()).toEqual(['approved', 'pending', 'pending', 'pending', 'rejected']);
  });

  it('is safe to ask for twice (two visitors arriving together)', async () => {
    await Promise.all([ensureDemo(svc), ensureDemo(svc)]);
    const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).not('demo_key', 'is', null);
    expect(count).toBe(7);
  });

  it('signs a visitor in as member 1 or member 2 without any password', async () => {
    for (const who of ['member', 'host'] as const) {
      const { client, userId } = await enter(who);
      expect((await client.auth.getUser()).data.user?.id).toBe(userId);
      expect(userId).toBe(ids.get(who));
      expect(((await client.from('plans').select('id')).data ?? []).length).toBeGreaterThan(0);
      expect((await client.from('member_private').select('user_id')).data).toEqual([{ user_id: userId }]); // no numbers but her own
    }
  });

  it('signs the demo admin in with the second step done, again and again, even after a visitor removes it', async () => {
    const first = await enter('admin');
    expect((await first.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2');
    expect(((await first.client.from('applications').select('id')).data ?? []).length).toBeGreaterThanOrEqual(5);

    const second = await enter('admin');
    expect((await second.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2');

    // a vandal removes the authenticator
    const factors = (await svc.auth.admin.mfa.listFactors({ userId: second.userId })).data?.factors ?? [];
    for (const f of factors) await second.client.auth.mfa.unenroll({ factorId: f.id });
    const third = await enter('admin');
    expect((await third.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2');
  });

  it('repairs a login a visitor changed', async () => {
    const { client } = await enter('member');
    await client.auth.updateUser({ password: 'vandal-password-1' });
    await svc.auth.admin.updateUserById(ids.get('member')!, { email: 'vandal@members.mesa.invalid', email_confirm: true });
    const again = await enter('member');
    expect((await again.client.auth.getUser()).data.user?.id).toBe(ids.get('member'));
  });

  describe('the demo admin cannot harm real accounts or break the demo', () => {
    let admin: SupabaseClient;
    beforeAll(async () => {
      admin = (await enter('admin')).client;
    });

    it('cannot make a password link for the owner, by the button or by writing it directly', async () => {
      expect((await admin.rpc('admin_new_link', { p_profile: owner.id, p_token_hash: hash() })).error?.message).toContain('demo_protected');
      const me = (await admin.auth.getUser()).data.user!.id;
      const direct = await admin.from('invites').insert({ profile_id: owner.id, purpose: 'reset', token_hash: hash(), expires_at: new Date(Date.now() + 3600_000).toISOString(), created_by: me });
      expect(direct.error?.message).toContain('demo_protected');
      expect((await svc.from('invites').select('id').eq('profile_id', owner.id)).data).toHaveLength(0);
    });

    it('cannot remove the owner or change the owner\'s card', async () => {
      expect((await admin.rpc('admin_remove_member', { p_user: owner.id })).error).not.toBeNull();
      await admin.from('profiles').update({ name: 'hacked' }).eq('id', owner.id);
      expect(await profileOf(owner.id)).toMatchObject({ name: 'owner', role: 'admin', status: 'active', is_demo: false });
    });

    it('cannot remove one of the cast or make a link for them', async () => {
      const marta = ids.get('member')!;
      expect((await admin.rpc('admin_remove_member', { p_user: marta })).error?.message).toContain('demo_protected');
      expect((await admin.rpc('admin_new_link', { p_profile: marta, p_token_hash: hash() })).error?.message).toContain('demo_protected');
      expect(await profileOf(marta)).toMatchObject({ status: 'active' });
    });

    it('can run the door for a throwaway account: approve, link, remove', async () => {
      const guest = await makeUser({ name: 'throwaway' }); // created while the demo is on
      expect(await profileOf(guest.id)).toMatchObject({ is_demo: true, demo_key: null });
      expect((await admin.rpc('admin_new_link', { p_profile: guest.id, p_token_hash: hash() })).error).toBeNull();
      expect((await admin.rpc('admin_remove_member', { p_user: guest.id })).error).toBeNull();
      const { data: pending } = await admin.from('applications').select('id').eq('status', 'pending').limit(1).single();
      expect((await admin.rpc('admin_approve', { p_application: pending!.id, p_token_hash: hash() })).error).toBeNull();
    });
  });

  describe('a demo member has the same limits', () => {
    it('cannot upload a photo or register for pings', async () => {
      const { client, userId } = await enter('member');
      const upload = await client.storage.from('avatars').upload(`${userId}/avatar-1.jpg`, new Blob([new Uint8Array([255, 216, 255, 224])]), { contentType: 'image/jpeg' });
      expect(upload.error).not.toBeNull();
      const push = await client.rpc('save_push_subscription', { p_endpoint: 'https://push.example.test/x', p_p256dh: 'a'.repeat(40), p_auth: 'b'.repeat(16) });
      expect(push.error?.message).toContain('demo_no_push');
    });

    it('the owner keeps both', async () => {
      const mine = await signIn(owner);
      const push = await mine.rpc('save_push_subscription', { p_endpoint: `https://push.example.test/${owner.id}`, p_p256dh: 'a'.repeat(40), p_auth: 'b'.repeat(16) });
      expect(push.error).toBeNull();
    });

    it('cannot flood the feed', async () => {
      const { client } = await enter('host');
      let refused = 0;
      for (let i = 0; i < 25 && !refused; i++) {
        const r = await client.rpc('create_plan', { p_title: `flood ${i}`, p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place_name: 'x', p_maps_url: null, p_booking_url: null, p_free_plus_one: false });
        if (r.error?.message === 'too_many_plans') refused++;
        else expect(r.error).toBeNull();
      }
      expect(refused).toBeGreaterThan(0);
    });
  });

  describe('the nightly reset', () => {
    it('removes what visitors did and restores the cast, without touching the owner', async () => {
      const mine = await signIn(owner);
      const ownPlan = await mine.rpc('create_plan', { p_title: 'owner plan', p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place_name: 'home', p_maps_url: null, p_booking_url: null, p_free_plus_one: false });
      expect(ownPlan.error).toBeNull();

      const { client, userId } = await enter('member');
      await client.from('profiles').update({ name: 'rude name' }).eq('id', userId);
      await client.rpc('create_plan', { p_title: 'junk plan', p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place_name: 'x', p_maps_url: null, p_booking_url: null, p_free_plus_one: false });
      const intrude = await client.from('plan_messages').insert({ plan_id: ownPlan.data as string, sender_id: userId, kind: 'user', body: 'junk' });
      expect(intrude.error).not.toBeNull();
      const visitor = await makeUser({ name: 'visitoraccount' });

      expect((await svc.rpc('demo_reset')).error).toBeNull();
      expect((await svc.rpc('demo_reset')).error).toBeNull(); // twice is fine

      expect((await profileOf(userId))?.name).toBe('Marta');
      expect((await svc.from('plans').select('id').eq('title', 'junk plan')).data).toHaveLength(0);
      expect((await svc.from('plan_messages').select('id').eq('body', 'junk')).data).toHaveLength(0);
      expect(await profileOf(visitor.id)).toBeNull();
      // the owner and her plan survive
      expect(await profileOf(owner.id)).toMatchObject({ name: 'owner', role: 'admin', status: 'active', is_demo: false });
      expect((await svc.from('member_private').select('whatsapp_e164').eq('user_id', owner.id).single()).data?.whatsapp_e164).toBe(owner.phone);
      expect((await svc.from('plans').select('id').eq('title', 'owner plan')).data).toHaveLength(1);
    });

    it('refuses to run if a real member has appeared', async () => {
      const guest = await makeUser({ name: 'becamereal' });
      await svc.from('profiles').update({ is_demo: false }).eq('id', guest.id);
      expect((await svc.rpc('demo_reset')).error?.message).toContain('real_members_present');
      await svc.auth.admin.deleteUser(guest.id);
    });
  });

  describe('what a visitor can leave behind', () => {
    const level = async (c: SupabaseClient) => (await c.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel;
    const factorsOf = async (id: string) => (await svc.auth.admin.mfa.listFactors({ userId: id })).data?.factors ?? [];
    /** what a visitor can do with a session and the public key: set a password, add an authenticator, stuff metadata */
    const plant = async (who: 'host' | 'admin') => {
      const { client, userId } = await enter(who);
      const password = `vandal-${randomBytes(6).toString('hex')}-1`;
      expect((await client.auth.updateUser({ password, data: { junk: 'x'.repeat(2000) } })).error).toBeNull();
      // phone sign-in is off, so the public call may refuse: put the number there the way a looser setup would
      expect((await svc.auth.admin.updateUserById(userId, { phone: `+34699${Math.floor(100000 + Math.random() * 899999)}`, phone_confirm: true })).error).toBeNull();
      const extra = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `vandal ${Date.now()}` });
      expect(extra.error).toBeNull();
      const phone = (await svc.from('member_private').select('whatsapp_e164').eq('user_id', userId).single()).data!.whatsapp_e164 as string;
      return { client, userId, password, factorId: extra.data!.id, email: loginEmail(phone) };
    };
    const leftovers = async (p: Awaited<ReturnType<typeof plant>>) => {
      expect((await anonClient().auth.signInWithPassword({ email: p.email, password: p.password })).error, 'password').not.toBeNull();
      expect((await factorsOf(p.userId)).map((f) => f.id), 'authenticator').not.toContain(p.factorId);
      expect((await p.client.auth.getUser()).error, 'old session').not.toBeNull();
      const { data: after } = await svc.auth.admin.getUserById(p.userId);
      expect(after.user?.user_metadata, 'metadata').not.toHaveProperty('junk');
      expect(after.user?.phone ?? '', 'phone number').toBe('');
    };

    it('is all gone after a reset, and entry still works', async () => {
      const host = await plant('host');
      const admin = await plant('admin');
      expect((await svc.rpc('demo_reset')).error).toBeNull();
      await leftovers(host);
      await leftovers(admin);
      expect(await level((await enter('admin')).client)).toBe('aal2');
      expect((await enter('host')).userId).toBe(host.userId);
    });

    it('opens nothing once the demo is switched off, and the demo can come back', async () => {
      const admin = await plant('admin');
      const member = await enter('member');
      expect((await svc.from('demo_config').update({ enabled: false }).eq('id', 1)).error).toBeNull();
      const real = await svc.from('applications').insert({ name: 'Real', instagram: '@real', whatsapp_e164: '+34699888777' }).select('id').single();
      expect(real.error).toBeNull();
      for (const c of [admin.client, member.client]) {
        expect((await c.from('applications').select('id')).data ?? []).toHaveLength(0);
        expect((await c.from('profiles').select('id').neq('id', admin.userId).neq('id', member.userId)).data ?? []).toHaveLength(0);
      }
      await leftovers(admin);
      expect((await factorsOf(admin.userId))).toHaveLength(0);
      await svc.from('applications').delete().eq('id', real.data!.id);
      expect((await svc.from('demo_config').update({ enabled: true }).eq('id', 1)).error).toBeNull();
      expect(await level((await enter('admin')).client)).toBe('aal2');
      expect(await profileOf(admin.userId)).toMatchObject({ status: 'active', role: 'admin' });
    });
  });

  it('keeps earlier admins signed in when more visitors arrive at the same moment', async () => {
    const first = (await enter('admin')).client;
    for (let round = 0; round < 3; round++) {
      const more = await Promise.all([enter('admin'), enter('admin'), enter('admin')]);
      for (const c of [first, ...more.map((m) => m.client)]) {
        expect((await c.auth.getUser()).error).toBeNull();
        expect((await c.from('applications').select('id').limit(1)).data).toHaveLength(1);
      }
    }
  });

  it('always has a request waiting for the next admin', async () => {
    await svc.from('applications').update({ status: 'rejected' }).eq('status', 'pending').like('whatsapp_e164', '+346000000%');
    const { client } = await enter('admin');
    const { data } = await client.from('applications').select('whatsapp_e164').eq('status', 'pending');
    expect(data?.length).toBeGreaterThanOrEqual(3);
    for (const a of data ?? []) expect(a.whatsapp_e164).toMatch(/^\+346000000\d\d$/);
  });

  describe('an admin who is not part of the demo, added while it runs', () => {
    let second: TestUser;
    let admin: SupabaseClient;
    beforeAll(async () => {
      second = await makeUser({ name: 'secondowner', role: 'admin' });
      admin = (await enter('admin')).client;
    });

    it('is not a demo account', async () => {
      expect(await profileOf(second.id)).toMatchObject({ is_demo: false });
    });

    it('cannot be given a link or removed by the demo admin, and keeps her plans through a reset', async () => {
      expect((await admin.rpc('admin_new_link', { p_profile: second.id, p_token_hash: hash() })).error?.message).toContain('demo_protected');
      expect((await admin.rpc('admin_remove_member', { p_user: second.id })).error).not.toBeNull();
      const mine = await signIn(second);
      expect((await mine.rpc('create_plan', plan('second owner plan'))).error).toBeNull();
      expect((await svc.rpc('demo_reset')).error).toBeNull();
      expect((await svc.from('plans').select('id').eq('host_id', second.id)).data).toHaveLength(1);
      expect(await profileOf(second.id)).toMatchObject({ role: 'admin', status: 'active' });
    });
  });

  it('never touches a real login: password, session and authenticator survive a reset and switching off', async () => {
    const real = await makeUser({ name: 'realkeeper', role: 'admin' });
    const session = await signIn(real);
    const factor = await session.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'mine' });
    expect(factor.error).toBeNull();
    const intact = async (when: string) => {
      expect((await session.auth.getUser()).error, `${when}: session`).toBeNull();
      expect((await anonClient().auth.signInWithPassword({ email: loginEmail(real.phone), password: real.password })).error, `${when}: password`).toBeNull();
      const list = (await svc.auth.admin.mfa.listFactors({ userId: real.id })).data?.factors ?? [];
      expect(list.map((f) => f.id), `${when}: authenticator`).toContain(factor.data!.id);
      expect(await profileOf(real.id), when).toMatchObject({ status: 'active', role: 'admin', is_demo: false });
    };
    expect((await svc.rpc('demo_reset')).error).toBeNull();
    await intact('after a reset');
    expect((await svc.from('demo_config').update({ enabled: false }).eq('id', 1)).error).toBeNull();
    await intact('after switching off');
    expect((await svc.from('demo_config').update({ enabled: true }).eq('id', 1)).error).toBeNull();
    await ensureDemo(svc);
    await intact('after switching on');
    await svc.auth.admin.deleteUser(real.id);
  });

  it('keeps everyone signed in when the first visitors arrive together right after switching on', async () => {
    expect((await svc.from('demo_config').update({ enabled: false }).eq('id', 1)).error).toBeNull();
    expect((await svc.from('demo_config').update({ enabled: true }).eq('id', 1)).error).toBeNull();
    const first = await Promise.all([enter('admin'), enter('member'), enter('host'), enter('admin'), enter('member'), enter('host')]);
    for (const v of first) expect((await v.client.auth.getUser()).error).toBeNull();
  });

  it('a slow sign-in cannot free the place of the one that followed it', async () => {
    const a = (await svc.rpc('demo_lock', { p_key: 'test', p_seconds: 0 })).data as string;
    await new Promise((r) => setTimeout(r, 20));
    const b = (await svc.rpc('demo_lock', { p_key: 'test', p_seconds: 60 })).data as string;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    await svc.rpc('demo_unlock', { p_key: 'test', p_token: a }); // late
    expect((await svc.rpc('demo_lock', { p_key: 'test', p_seconds: 60 })).data).toBeNull();
    await svc.rpc('demo_unlock', { p_key: 'test', p_token: b });
    const c = (await svc.rpc('demo_lock', { p_key: 'test', p_seconds: 1 })).data as string;
    expect(c).toBeTruthy();
    await svc.rpc('demo_unlock', { p_key: 'test', p_token: c });
  });

  it('never runs out of new requests, however many visitors approve them all', async () => {
    for (let round = 0; round < 25; round++) {
      await svc.from('applications').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('status', 'pending').like('whatsapp_e164', '+346000000%');
      expect((await svc.rpc('demo_top_up_requests')).error).toBeNull();
      const { count } = await svc.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      expect(count, `round ${round}`).toBeGreaterThanOrEqual(3);
    }
    expect((await svc.rpc('demo_reset')).error).toBeNull();
  });

  describe('real accounts are out of reach of demo accounts', () => {
    let ownPlan: string;
    beforeAll(async () => {
      const mine = await signIn(owner);
      expect((await mine.from('member_instagram').update({ handle: '@owner.private', is_public: false }).eq('user_id', owner.id)).error).toBeNull();
      expect((await svc.from('member_instagram').select('handle').eq('user_id', owner.id).single()).data?.handle).toBe('@owner.private');
      // written by the server: her own writes need the second sign-in step
      expect((await svc.from('admin_events').insert({ admin_id: owner.id, action: 'note', subject: 'owner only' })).error).toBeNull();
      const made = await mine.rpc('create_plan', plan('owner private plan'));
      expect(made.error).toBeNull();
      ownPlan = made.data as string;
    });

    it('cannot see or join her plans', async () => {
      for (const who of ['member', 'admin'] as const) {
        const { client } = await enter(who);
        expect((await client.from('plans').select('id').eq('id', ownPlan)).data).toHaveLength(0);
        expect((await client.rpc('join_plan', { p_plan: ownPlan })).error?.message).toContain('demo_protected');
      }
      expect((await svc.from('plan_members').select('user_id').eq('plan_id', ownPlan)).data).toEqual([{ user_id: owner.id }]);
      expect((await svc.from('plan_messages').select('event').eq('plan_id', ownPlan).eq('event', 'join')).data).toHaveLength(0);
    });

    it('cannot read her number, by any account or filter', async () => {
      for (const who of ['member', 'host', 'admin'] as const) {
        const { client, userId } = await enter(who);
        expect((await client.from('member_private').select('whatsapp_e164').eq('user_id', owner.id)).data, who).toHaveLength(0);
        expect((await client.from('member_private').select('user_id').eq('whatsapp_e164', owner.phone)).data, who).toHaveLength(0);
        expect(JSON.stringify((await client.from('member_private').select('*')).data), who).not.toContain(owner.phone);
        // her own number stays readable
        expect((await client.from('member_private').select('user_id').eq('user_id', userId)).data, who).toHaveLength(1);
      }
      // the demo admin still reads the fake numbers, and the real admin still reads everyone's
      const { client } = await enter('admin');
      expect((await client.from('member_private').select('user_id').eq('user_id', ids.get('host')!)).data).toHaveLength(1);
      const mine = await signIn(owner);
      expect((await mine.from('member_private').select('whatsapp_e164').eq('user_id', owner.id).single()).data?.whatsapp_e164).toBe(owner.phone);
    });

    it('cannot read her private handle or her audit log', async () => {
      const { client } = await enter('admin');
      expect((await client.from('member_instagram').select('handle').eq('user_id', owner.id)).data).toHaveLength(0);
      expect((await client.from('admin_events').select('id').eq('admin_id', owner.id)).data).toHaveLength(0);
      expect(((await client.from('member_instagram').select('handle')).data ?? []).length).toBeGreaterThan(0);
    });

    it('tells demo accounts nothing about her plans', async () => {
      const mine = await signIn(owner);
      const made = await mine.rpc('create_plan', plan('owner secret outing'));
      expect(made.error).toBeNull();
      const { data } = await svc.from('notifications').select('user_id').eq('plan_id', made.data as string);
      const demo = (await svc.from('profiles').select('id').eq('is_demo', true)).data!.map((p) => p.id as string);
      expect((data ?? []).filter((n) => demo.includes(n.user_id as string))).toHaveLength(0);
      const { client } = await enter('member');
      expect(JSON.stringify((await client.from('notifications').select('data')).data)).not.toContain('owner secret outing');
    });

    it('sends her no notifications about demo plans', async () => {
      await svc.from('notifications').delete().eq('user_id', owner.id);
      const { client } = await enter('host');
      expect((await client.rpc('create_plan', plan('demo noise'))).error).toBeNull();
      expect((await svc.rpc('demo_reset')).error).toBeNull();
      expect((await svc.from('notifications').select('id').eq('user_id', owner.id)).data).toHaveLength(0);
    });
  });

  it('only counts the exact range reserved for fake numbers', async () => {
    const long = await svc.from('applications').insert({ name: 'Long', instagram: '@long', whatsapp_e164: '+3460000012345' });
    expect(long.error?.message).toContain('demo_no_requests');
  });

  it('limits how often one network can enter', async () => {
    const ip = randomBytes(8).toString('hex');
    for (let i = 0; i < DEMO_ENTRY_LIMIT.max; i++) expect(await demoEntryAllowed(svc, ip)).toBe(true);
    expect(await demoEntryAllowed(svc, ip)).toBe(false);
  });
});
