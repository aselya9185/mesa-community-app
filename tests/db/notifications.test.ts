import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, type TestUser } from './helpers';

const svc = serviceClient();
const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();

let keep: string | undefined;
async function newPlan(c: SupabaseClient, over: Record<string, unknown> = {}) {
  await svc.from('plans').delete().eq('host_id', host.id).neq('id', keep ?? '00000000-0000-0000-0000-000000000000');
  const r = await c.rpc('create_plan', {
    p_title: 'Zumba', p_starts_at: future(), p_place_name: 'Studio', p_maps_url: null,
    p_booking_url: 'https://studio.example/book', p_free_plus_one: true, p_host_booked: false, p_poll: [], ...over,
  });
  expect(r.error).toBeNull();
  return r.data as string;
}
const notesFor = async (user: TestUser, plan?: string) => {
  let q = svc.from('notifications').select('id, type, plan_id, data, read_at').eq('user_id', user.id).order('created_at');
  if (plan) q = q.eq('plan_id', plan);
  return (await q).data ?? [];
};
const types = async (user: TestUser, plan: string) => (await notesFor(user, plan)).map((n) => n.type);

let host: TestUser, anna: TestUser, carla: TestUser, outsider: TestUser, removedMember: TestUser, noProfile: TestUser;
let hostC: SupabaseClient, annaC: SupabaseClient, carlaC: SupabaseClient;

beforeAll(async () => {
  host = await makeUser({ name: 'Hostess Lopez' });
  anna = await makeUser({ name: 'Anna' });
  carla = await makeUser({ name: 'Carla' });
  outsider = await makeUser({ name: 'Nina' });
  removedMember = await makeUser({ name: 'Gone', status: 'removed' });
  noProfile = await makeUser({ withProfile: false });
  [hostC, annaC, carlaC] = await Promise.all([signIn(host), signIn(anna), signIn(carla)]);
});
afterAll(async () => {
  await svc.from('plans').delete().eq('host_id', host.id);
  await cleanup();
});

describe('who can read their notifications', () => {
  it('only the owner reads, marks read, or deletes them', async () => {
    const plan = await newPlan(hostC);
    const mine = await notesFor(anna, plan);
    expect(mine).toHaveLength(1);
    expect(((await annaC.from('notifications').select('id').eq('plan_id', plan)).data ?? []).length).toBe(1);
    // everyone else sees nothing of hers
    for (const c of [carlaC, anonClient()]) {
      const { data } = await c.from('notifications').select('id').eq('id', mine[0]!.id);
      expect(data ?? []).toHaveLength(0);
    }
    await carlaC.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine[0]!.id);
    await carlaC.from('notifications').delete().eq('id', mine[0]!.id);
    expect((await notesFor(anna, plan))[0]?.read_at).toBeNull();
  });

  it('she can mark hers read, but cannot rewrite what a notification says', async () => {
    const plan = await newPlan(hostC);
    const n = (await notesFor(anna, plan))[0]!;
    expect((await annaC.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)).error).toBeNull();
    expect((await annaC.from('notifications').update({ type: 'plus_one' }).eq('id', n.id)).error).not.toBeNull();
    expect((await annaC.from('notifications').update({ data: { title: 'hacked' } }).eq('id', n.id)).error).not.toBeNull();
  });

  it('clients cannot create notifications for anyone', async () => {
    const plan = await newPlan(hostC);
    expect((await annaC.from('notifications').insert({ user_id: carla.id, type: 'plus_one', plan_id: plan })).error).not.toBeNull();
  });

  it('visitors, pending and removed members read nothing', async () => {
    for (const c of [anonClient(), await signIn(noProfile), await signIn(removedMember)]) {
      expect(((await c.from('notifications').select('id')).data ?? []).length).toBe(0);
    }
  });
});

describe('new plan', () => {
  it('tells every active member except the host, nobody else', async () => {
    const plan = await newPlan(hostC);
    expect(await types(anna, plan)).toEqual(['new_plan']);
    expect(await types(carla, plan)).toEqual(['new_plan']);
    expect(await types(outsider, plan)).toEqual(['new_plan']);
    expect(await types(host, plan)).toEqual([]);
    expect(await types(removedMember, plan)).toEqual([]);
    expect(await types(noProfile, plan)).toEqual([]);
  });

  it('says who dropped what, with only first names and no contact details', async () => {
    const plan = await newPlan(hostC, { p_title: 'Sunset run' });
    const n = (await notesFor(anna, plan))[0]!;
    expect(n.data).toMatchObject({ actor: 'hostess', title: 'Sunset run' });
    expect(JSON.stringify(n.data)).not.toMatch(/\+34|@members|whatsapp/i);
  });
});

describe('someone joined', () => {
  it('tells the host, once per person, and not for the host herself', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await annaC.rpc('join_plan', { p_plan: plan }); // twice: no second notification
    expect((await types(host, plan)).filter((t) => t === 'joined')).toHaveLength(1);
    expect(await types(anna, plan)).not.toContain('joined');
    expect((await notesFor(host, plan)).find((n) => n.type === 'joined')?.data).toMatchObject({ actor: 'anna' });
  });
});

describe('the free +1', () => {
  it('only the person who got it is told', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await carlaC.rpc('join_plan', { p_plan: plan });
    await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: anna.id });
    expect(await types(anna, plan)).toContain('plus_one');
    expect(await types(carla, plan)).not.toContain('plus_one');
    expect(await types(host, plan)).not.toContain('plus_one');
  });
});

describe('chat messages', () => {
  it('tell the other people in the plan, never the sender or outsiders', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await carlaC.rpc('join_plan', { p_plan: plan });
    await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', body: 'who has a spare mat?' });
    expect(await types(host, plan)).toContain('message');
    expect(await types(carla, plan)).toContain('message');
    expect(await types(anna, plan)).not.toContain('message');
    expect(await types(outsider, plan)).not.toContain('message');
  });

  it('gather into one unread notification per plan, with a count', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    for (const b of ['one', 'two', 'three']) await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', body: b });
    const msgs = (await notesFor(host, plan)).filter((n) => n.type === 'message');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.data).toMatchObject({ count: 3, preview: 'three', actor: 'anna' });
  });

  it('start a fresh notification once the last one was read', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', body: 'first' });
    const first = (await notesFor(host, plan)).find((n) => n.type === 'message')!;
    await hostC.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', first.id);
    await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', body: 'second' });
    expect((await notesFor(host, plan)).filter((n) => n.type === 'message')).toHaveLength(2);
  });

  it('a member who left is not notified any more', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await carlaC.rpc('join_plan', { p_plan: plan });
    await carlaC.rpc('leave_plan', { p_plan: plan });
    await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', body: 'hello?' });
    expect(await types(carla, plan)).not.toContain('message');
  });

  it('system messages do not generate notifications', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan }); // writes "anna is in" as a system message
    expect(await types(carla, plan)).toEqual(['new_plan']);
  });
});

describe('plan edited and cancelled', () => {
  it('tell the people going, not the host, once each', async () => {
    const plan = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: plan });
    await hostC.from('plans').update({ title: 'Zumba XL' }).eq('id', plan);
    await hostC.from('plans').update({ free_plus_one: false }).eq('id', plan); // not a visible edit
    await hostC.rpc('cancel_plan', { p_plan: plan });
    await hostC.rpc('cancel_plan', { p_plan: plan });
    expect(await types(anna, plan)).toEqual(['new_plan', 'plan_edited', 'plan_cancelled']);
    expect(await types(host, plan)).not.toContain('plan_edited');
    expect(await types(host, plan)).not.toContain('plan_cancelled');
    // people who never joined were not "going": they only got the original news
    expect(await types(carla, plan)).toEqual(['new_plan']);
  });
});

describe('push subscriptions', () => {
  const sub = (n: string) => ({ p_endpoint: `https://push.example/${n}`, p_p256dh: 'p'.repeat(87), p_auth: 'a'.repeat(22), p_ua: 'test' });

  it('a member saves hers; the same device moves to whoever signs in next', async () => {
    const ep = sub(`dev-${Math.random()}`);
    expect((await annaC.rpc('save_push_subscription', ep)).error).toBeNull();
    expect(((await annaC.from('push_subscriptions').select('endpoint')).data ?? []).map((s) => s.endpoint)).toContain(ep.p_endpoint);
    expect((await carlaC.rpc('save_push_subscription', ep)).error).toBeNull();
    expect(((await annaC.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data ?? []).length).toBe(0);
    expect(((await carlaC.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data ?? []).length).toBe(1);
  });

  it('nobody reads or deletes someone else’s; she can remove her own', async () => {
    const ep = sub(`own-${Math.random()}`);
    await annaC.rpc('save_push_subscription', ep);
    expect(((await carlaC.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data ?? []).length).toBe(0);
    await carlaC.from('push_subscriptions').delete().eq('endpoint', ep.p_endpoint);
    expect((await svc.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data).toHaveLength(1);
    await annaC.from('push_subscriptions').delete().eq('endpoint', ep.p_endpoint);
    expect((await svc.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data).toHaveLength(0);
  });

  it('visitors and non-members cannot subscribe; no direct inserts; endpoints must be https', async () => {
    expect((await anonClient().rpc('save_push_subscription', sub('x'))).error).not.toBeNull();
    expect((await (await signIn(noProfile)).rpc('save_push_subscription', sub('y'))).error).not.toBeNull();
    expect((await annaC.from('push_subscriptions').insert({ user_id: anna.id, endpoint: 'https://push.example/direct', p256dh: 'p', auth: 'a' })).error).not.toBeNull();
    expect((await annaC.rpc('save_push_subscription', { ...sub('z'), p_endpoint: 'http://insecure.example/z' })).error).not.toBeNull();
  });

  it('removing a member removes her devices', async () => {
    const gone = await makeUser();
    const gc = await signIn(gone);
    const ep = sub(`gone-${Math.random()}`);
    await gc.rpc('save_push_subscription', ep);
    await svc.auth.admin.deleteUser(gone.id);
    expect((await svc.from('push_subscriptions').select('endpoint').eq('endpoint', ep.p_endpoint)).data).toHaveLength(0);
  });
});

describe('the push hand-off never breaks notifications', () => {
  it('keeps working when the push endpoint is unreachable or unset', async () => {
    await svc.from('push_config').upsert({ id: 1, url: 'http://127.0.0.1:9/never', secret: 'test-secret' });
    const plan = await newPlan(hostC);
    expect(await types(anna, plan)).toEqual(['new_plan']);
    await svc.from('push_config').delete().eq('id', 1);
    const plan2 = await newPlan(hostC);
    expect(await types(anna, plan2)).toEqual(['new_plan']);
  });

  it('the push settings are invisible to every client', async () => {
    expect(((await annaC.from('push_config').select('*')).data ?? []).length).toBe(0);
    expect(((await anonClient().from('push_config').select('*')).data ?? []).length).toBe(0);
  });
});
