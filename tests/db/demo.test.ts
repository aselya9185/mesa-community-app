import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoEntryAllowed, DEMO_ENTRY_LIMIT, ensureDemo, enterDemo } from '../../src/server/demo';
import { demoOn } from './demo-helpers';
import { anonClient, cleanup, makeUser, serviceClient, signIn, type TestUser } from './helpers';

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
      for (let i = 0; i < 18; i++) {
        const r = await client.rpc('create_plan', { p_title: `flood ${i}`, p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place: 'x', p_maps_url: null, p_booking_url: null, p_plus_one: false });
        if (r.error?.message === 'too_fast') refused++;
      }
      expect(refused).toBeGreaterThan(0);
    });
  });

  describe('the nightly reset', () => {
    it('removes what visitors did and restores the cast, without touching the owner', async () => {
      const mine = await signIn(owner);
      const ownPlan = await mine.rpc('create_plan', { p_title: 'owner plan', p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place: 'home', p_maps_url: null, p_booking_url: null, p_plus_one: false });
      expect(ownPlan.error).toBeNull();

      const { client, userId } = await enter('member');
      await client.from('profiles').update({ name: 'rude name' }).eq('id', userId);
      await client.rpc('create_plan', { p_title: 'junk plan', p_starts_at: new Date(Date.now() + 86_400_000).toISOString(), p_place: 'x', p_maps_url: null, p_booking_url: null, p_plus_one: false });
      await client.from('plan_messages').insert({ plan_id: ownPlan.data as string, sender_id: userId, kind: 'user', body: 'junk' });
      const visitor = await makeUser({ name: 'visitoraccount' });
      await svc.from('applications').insert({ name: 'Real', instagram: '@real', whatsapp_e164: '+34699888777' });

      expect((await svc.rpc('demo_reset')).error).toBeNull();
      expect((await svc.rpc('demo_reset')).error).toBeNull(); // twice is fine

      expect((await profileOf(userId))?.name).toBe('Marta');
      expect((await svc.from('plans').select('id').eq('title', 'junk plan')).data).toHaveLength(0);
      expect((await svc.from('plan_messages').select('id').eq('body', 'junk')).data).toHaveLength(0);
      expect(await profileOf(visitor.id)).toBeNull();
      // the owner, her plan and anything outside the fake number range survive
      expect(await profileOf(owner.id)).toMatchObject({ name: 'owner', role: 'admin', status: 'active', is_demo: false });
      expect((await svc.from('member_private').select('whatsapp_e164').eq('user_id', owner.id).single()).data?.whatsapp_e164).toBe(owner.phone);
      expect((await svc.from('plans').select('id').eq('title', 'owner plan')).data).toHaveLength(1);
      expect((await svc.from('applications').select('id').eq('whatsapp_e164', '+34699888777')).data).toHaveLength(1);
      await svc.from('applications').delete().eq('whatsapp_e164', '+34699888777');
    });

    it('refuses to run if a real member has appeared', async () => {
      const guest = await makeUser({ name: 'becamereal' });
      await svc.from('profiles').update({ is_demo: false }).eq('id', guest.id);
      expect((await svc.rpc('demo_reset')).error?.message).toContain('real_members_present');
      await svc.auth.admin.deleteUser(guest.id);
    });
  });

  it('limits how often one network can enter', async () => {
    const ip = randomBytes(8).toString('hex');
    for (let i = 0; i < DEMO_ENTRY_LIMIT.max; i++) expect(await demoEntryAllowed(svc, ip)).toBe(true);
    expect(await demoEntryAllowed(svc, ip)).toBe(false);
  });
});
