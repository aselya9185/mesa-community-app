import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, type TestUser } from './helpers';

const svc = serviceClient();
const inDays = (d: number, hour = 19) => {
  const t = new Date(Date.now() + d * 86400_000);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
};

async function create(c: SupabaseClient, over: Record<string, unknown> = {}) {
  return c.rpc('create_plan', {
    p_title: 'Zumba, first class free',
    p_starts_at: inDays(3),
    p_place_name: 'Studio Poblenou',
    p_maps_url: null,
    p_booking_url: null,
    p_free_plus_one: false,
    ...over,
  });
}
async function goingIds(plan: string): Promise<string[]> {
  const { data } = await svc.from('plan_members').select('user_id').eq('plan_id', plan);
  return (data ?? []).map((r) => r.user_id as string);
}

let host: TestUser, anna: TestUser, carla: TestUser, outsider: TestUser, removedMember: TestUser, noProfile: TestUser;
let hostC: SupabaseClient, annaC: SupabaseClient, carlaC: SupabaseClient, outsiderC: SupabaseClient;
let planId: string;

beforeAll(async () => {
  host = await makeUser({ name: 'hostess' });
  anna = await makeUser({ name: 'anna' });
  carla = await makeUser({ name: 'carla' });
  outsider = await makeUser({ name: 'nina' });
  removedMember = await makeUser({ name: 'gone', status: 'removed' });
  noProfile = await makeUser({ withProfile: false });
  [hostC, annaC, carlaC, outsiderC] = await Promise.all([signIn(host), signIn(anna), signIn(carla), signIn(outsider)]);
  const r = await create(hostC, { p_free_plus_one: true });
  expect(r.error).toBeNull();
  planId = r.data as string;
});
afterAll(async () => {
  await svc.from('plans').delete().eq('host_id', host.id);
  await svc.from('plans').delete().eq('host_id', anna.id);
  await cleanup();
});

describe('who can read plans', () => {
  it('a logged-out visitor reads nothing', async () => {
    for (const t of ['plans', 'plan_members', 'plan_removals']) {
      const { data } = await anonClient().from(t).select('*');
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('pending (no profile) and removed members read nothing', async () => {
    for (const u of [noProfile, removedMember]) {
      const c = await signIn(u);
      for (const t of ['plans', 'plan_members']) {
        const { data } = await c.from(t).select('*');
        expect(data ?? []).toHaveLength(0);
      }
    }
  });

  it('members see active plans and who is going', async () => {
    const { data: plan } = await annaC.from('plans').select('id, title, host_id').eq('id', planId).single();
    expect(plan?.title).toBe('Zumba, first class free');
    const { data: going } = await annaC.from('plan_members').select('user_id').eq('plan_id', planId);
    expect((going ?? []).map((g) => g.user_id)).toEqual([host.id]);
  });

  it('a cancelled plan is visible only to people who were in it', async () => {
    const r = await create(hostC, { p_title: 'cancel me' });
    const id = r.data as string;
    await annaC.rpc('join_plan', { p_plan: id });
    await hostC.rpc('cancel_plan', { p_plan: id });
    expect((await annaC.from('plans').select('id').eq('id', id)).data).toHaveLength(1); // she was in it
    expect((await hostC.from('plans').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await carlaC.from('plans').select('id').eq('id', id)).data).toHaveLength(0); // she was not
  });
});

describe('nobody writes tables directly', () => {
  it('no inserts, updates of protected columns, or deletes from the client', async () => {
    expect((await hostC.from('plans').insert({ host_id: host.id, title: 'x', starts_at: inDays(2), place_name: 'y' })).error).not.toBeNull();
    expect((await annaC.from('plan_members').insert({ plan_id: planId, user_id: anna.id })).error).not.toBeNull();
    expect((await hostC.from('plan_removals').insert({ plan_id: planId, user_id: anna.id })).error).not.toBeNull();
    await annaC.from('plan_members').delete().eq('plan_id', planId);
    await hostC.from('plans').delete().eq('id', planId);
    expect((await svc.from('plans').select('id').eq('id', planId)).data).toHaveLength(1);
  });

  it('the host cannot rewrite host, status or timestamps', async () => {
    for (const patch of [{ host_id: anna.id }, { status: 'cancelled' }, { created_at: '2020-01-01T00:00:00Z' }, { cancelled_at: new Date().toISOString() }]) {
      expect((await hostC.from('plans').update(patch).eq('id', planId)).error).not.toBeNull();
    }
  });
});

describe('creating a plan', () => {
  it('works for a member, and the host is going automatically', async () => {
    expect(await goingIds(planId)).toEqual([host.id]);
  });

  it('is refused for non-members and visitors', async () => {
    expect((await create(anonClient())).error).not.toBeNull();
    expect((await create(await signIn(noProfile))).error).not.toBeNull();
    expect((await create(await signIn(removedMember))).error).not.toBeNull();
  });

  it.each([
    ['a start in the past', { p_starts_at: inDays(-1) }],
    ['a start more than 90 days away', { p_starts_at: inDays(120) }],
    ['an empty title', { p_title: '   ' }],
    ['a title over 80 characters', { p_title: 'x'.repeat(81) }],
    ['an empty place', { p_place_name: '' }],
    ['a javascript: maps link', { p_maps_url: 'javascript:alert(1)' }],
    ['a non-http booking link', { p_booking_url: 'ftp://example.com' }],
  ])('rejects %s', async (_n, over) => {
    expect((await create(annaC, over)).error).not.toBeNull();
  });

  it('keeps the booking link and treats empty links as none', async () => {
    const r = await create(annaC, { p_booking_url: 'https://studio.example/book', p_maps_url: '  ' });
    const { data } = await svc.from('plans').select('booking_url, maps_url').eq('id', r.data as string).single();
    expect(data).toEqual({ booking_url: 'https://studio.example/book', maps_url: null });
  });

  it('is limited to 10 plans a day per host', async () => {
    const spammer = await makeUser();
    const c = await signIn(spammer);
    const results = [];
    for (let i = 0; i < 12; i++) results.push((await create(c, { p_title: `p${i}` })).error);
    expect(results.filter((e) => e === null)).toHaveLength(10);
    await svc.from('plans').delete().eq('host_id', spammer.id);
  });
});

describe('joining and leaving', () => {
  it('a member can join; twice is harmless; she shows in the going list', async () => {
    expect((await annaC.rpc('join_plan', { p_plan: planId })).error).toBeNull();
    expect((await annaC.rpc('join_plan', { p_plan: planId })).error).toBeNull();
    expect((await goingIds(planId)).sort()).toEqual([host.id, anna.id].sort());
  });

  it('visitors and non-members cannot join', async () => {
    expect((await anonClient().rpc('join_plan', { p_plan: planId })).error).not.toBeNull();
    expect((await (await signIn(noProfile)).rpc('join_plan', { p_plan: planId })).error).not.toBeNull();
    expect((await (await signIn(removedMember)).rpc('join_plan', { p_plan: planId })).error).not.toBeNull();
  });

  it('cannot join a cancelled plan or one that already started', async () => {
    const c1 = (await create(hostC, { p_title: 'to cancel' })).data as string;
    await hostC.rpc('cancel_plan', { p_plan: c1 });
    expect((await carlaC.rpc('join_plan', { p_plan: c1 })).error).not.toBeNull();
    const started = (await svc.from('plans').insert({ host_id: host.id, title: 'old', starts_at: inDays(-1), place_name: 'x' }).select('id').single()).data!.id as string;
    expect((await carlaC.rpc('join_plan', { p_plan: started })).error).not.toBeNull();
  });

  it('a member can leave; the host cannot', async () => {
    await carlaC.rpc('join_plan', { p_plan: planId });
    expect((await carlaC.rpc('leave_plan', { p_plan: planId })).error).toBeNull();
    expect(await goingIds(planId)).not.toContain(carla.id);
    expect((await hostC.rpc('leave_plan', { p_plan: planId })).error).not.toBeNull();
    expect(await goingIds(planId)).toContain(host.id);
  });

  it('leaving a plan she is not in does nothing to others', async () => {
    await outsiderC.rpc('leave_plan', { p_plan: planId });
    expect(await goingIds(planId)).toContain(host.id);
  });
});

describe('editing', () => {
  it('only the host can edit, and only editable columns', async () => {
    expect((await hostC.from('plans').update({ title: 'Zumba XL', free_plus_one: false }).eq('id', planId)).error).toBeNull();
    await annaC.from('plans').update({ title: 'hijacked' }).eq('id', planId);
    const { data } = await svc.from('plans').select('title').eq('id', planId).single();
    expect(data?.title).toBe('Zumba XL');
  });

  it('a new start time must still be in the future', async () => {
    expect((await hostC.from('plans').update({ starts_at: inDays(-2) }).eq('id', planId)).error).not.toBeNull();
    expect((await hostC.from('plans').update({ starts_at: inDays(5) }).eq('id', planId)).error).toBeNull();
  });

  it('a cancelled plan cannot be edited any more', async () => {
    const id = (await create(hostC, { p_title: 'cancelled soon' })).data as string;
    await hostC.rpc('cancel_plan', { p_plan: id });
    await hostC.from('plans').update({ title: 'revived' }).eq('id', id);
    const { data } = await svc.from('plans').select('title').eq('id', id).single();
    expect(data?.title).toBe('cancelled soon');
  });
});

describe('cancelling and removing (host only)', () => {
  it('only the host can cancel', async () => {
    const id = (await create(hostC, { p_title: 'cancel test' })).data as string;
    expect((await annaC.rpc('cancel_plan', { p_plan: id })).error).not.toBeNull();
    expect((await svc.from('plans').select('status').eq('id', id).single()).data?.status).toBe('active');
    expect((await hostC.rpc('cancel_plan', { p_plan: id })).error).toBeNull();
    expect((await hostC.rpc('cancel_plan', { p_plan: id })).error).toBeNull(); // idempotent
    expect((await svc.from('plans').select('status, cancelled_at').eq('id', id).single()).data?.status).toBe('cancelled');
  });

  it('only the host can remove a member; the host cannot be removed', async () => {
    await annaC.rpc('join_plan', { p_plan: planId });
    await carlaC.rpc('join_plan', { p_plan: planId });
    expect((await annaC.rpc('remove_from_plan', { p_plan: planId, p_user: carla.id })).error).not.toBeNull();
    expect(await goingIds(planId)).toContain(carla.id);
    expect((await hostC.rpc('remove_from_plan', { p_plan: planId, p_user: host.id })).error).not.toBeNull();
    expect((await hostC.rpc('remove_from_plan', { p_plan: planId, p_user: carla.id })).error).toBeNull();
    expect(await goingIds(planId)).not.toContain(carla.id);
  });

  it('a removed member cannot rejoin; only the host can see who was removed', async () => {
    expect((await carlaC.rpc('join_plan', { p_plan: planId })).error).not.toBeNull();
    expect((await hostC.from('plan_removals').select('user_id').eq('plan_id', planId)).data?.map((r) => r.user_id)).toEqual([carla.id]);
    expect((await annaC.from('plan_removals').select('user_id').eq('plan_id', planId)).data ?? []).toHaveLength(0);
    expect((await carlaC.from('plan_removals').select('user_id').eq('plan_id', planId)).data ?? []).toHaveLength(0);
  });
});
