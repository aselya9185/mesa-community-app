import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, signInAal2, type TestUser } from './helpers';

const svc = serviceClient();
const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();

let keep: string | undefined;
async function newPlan(c: SupabaseClient, owner: TestUser, over: Record<string, unknown> = {}) {
  await svc.from('plans').delete().eq('host_id', owner.id).neq('id', keep ?? '00000000-0000-0000-0000-000000000000');
  const r = await c.rpc('create_plan', {
    p_title: 'Zumba', p_starts_at: future(), p_place_name: 'Studio', p_maps_url: null,
    p_booking_url: null, p_free_plus_one: false, p_host_booked: false, p_poll: [], ...over,
  });
  expect(r.error).toBeNull();
  return r.data as string;
}
const say = (c: SupabaseClient, u: TestUser, plan: string, body: string) => c.from('plan_messages').insert({ plan_id: plan, sender_id: u.id, kind: 'user', body });
const typesFor = async (u: TestUser, plan: string) => ((await svc.from('notifications').select('type').eq('user_id', u.id).eq('plan_id', plan)).data ?? []).map((n) => n.type);
const blocksOf = async (u: TestUser) => ((await svc.from('blocks').select('blocked_id').eq('blocker_id', u.id)).data ?? []).map((b) => b.blocked_id);

let host: TestUser, ana: TestUser, bea: TestUser, cleo: TestUser, outsider: TestUser, admin: TestUser, removedMember: TestUser, noProfile: TestUser;
let hostC: SupabaseClient, anaC: SupabaseClient, beaC: SupabaseClient, cleoC: SupabaseClient, outsiderC: SupabaseClient;

beforeAll(async () => {
  [host, ana, bea, cleo, outsider] = await Promise.all([makeUser({ name: 'Hosta' }), makeUser({ name: 'Ana' }), makeUser({ name: 'Bea' }), makeUser({ name: 'Cleo' }), makeUser({ name: 'Nora' })]);
  admin = await makeUser({ role: 'admin', name: 'Boss' });
  removedMember = await makeUser({ status: 'removed', name: 'Gone' });
  noProfile = await makeUser({ withProfile: false });
  [hostC, anaC, beaC, cleoC, outsiderC] = await Promise.all([signIn(host), signIn(ana), signIn(bea), signIn(cleo), signIn(outsider)]);
});
afterAll(async () => {
  for (const u of [host, ana, bea, cleo, outsider]) await svc.from('plans').delete().eq('host_id', u.id);
  await svc.from('reports').delete().in('reported_id', [ana.id, bea.id, cleo.id, outsider.id, host.id]);
  await cleanup();
});

describe('blocking', () => {
  it('a member can block and unblock another member; it is private to her', async () => {
    expect((await anaC.rpc('block_member', { p_user: bea.id })).error).toBeNull();
    expect((await anaC.rpc('block_member', { p_user: bea.id })).error).toBeNull(); // twice is harmless
    expect(await blocksOf(ana)).toEqual([bea.id]);
    expect(((await anaC.from('blocks').select('blocked_id')).data ?? []).map((b) => b.blocked_id)).toEqual([bea.id]);
    // bea cannot see that she was blocked; nobody else sees the list
    for (const c of [beaC, cleoC, anonClient()]) expect(((await c.from('blocks').select('*')).data ?? []).length).toBe(0);
    expect((await anaC.from('blocks').delete().eq('blocked_id', bea.id)).error).toBeNull();
    expect(await blocksOf(ana)).toEqual([]);
  });

  it('cannot block herself, a stranger, a removed member; non-members cannot block', async () => {
    expect((await anaC.rpc('block_member', { p_user: ana.id })).error).not.toBeNull();
    expect((await anaC.rpc('block_member', { p_user: '00000000-0000-0000-0000-000000000000' })).error).not.toBeNull();
    expect((await anaC.rpc('block_member', { p_user: removedMember.id })).error).not.toBeNull();
    expect((await (await signIn(noProfile)).rpc('block_member', { p_user: ana.id })).error).not.toBeNull();
    expect((await anonClient().rpc('block_member', { p_user: ana.id })).error).not.toBeNull();
  });

  it('nobody writes the blocks table directly, or removes someone else’s block', async () => {
    expect((await anaC.from('blocks').insert({ blocker_id: ana.id, blocked_id: cleo.id })).error).not.toBeNull();
    await anaC.rpc('block_member', { p_user: cleo.id });
    await beaC.from('blocks').delete().eq('blocker_id', ana.id);
    expect(await blocksOf(ana)).toEqual([cleo.id]);
    await anaC.rpc('unblock_member', { p_user: cleo.id });
  });
});

describe('what a block does', () => {
  it('hides the blocked member’s chat messages from the blocker only', async () => {
    const plan = await newPlan(hostC, host);
    for (const c of [anaC, beaC, cleoC]) await c.rpc('join_plan', { p_plan: plan });
    await say(beaC, bea, plan, 'bea says hi');
    await say(cleoC, cleo, plan, 'cleo says hi');
    await anaC.rpc('block_member', { p_user: bea.id });
    const bodiesFor = async (c: SupabaseClient) => ((await c.from('plan_messages').select('body').eq('plan_id', plan).eq('kind', 'user')).data ?? []).map((m) => m.body);
    expect(await bodiesFor(anaC)).toEqual(['cleo says hi']);
    expect((await bodiesFor(cleoC)).sort()).toEqual(['bea says hi', 'cleo says hi']);
    expect((await bodiesFor(beaC)).sort()).toEqual(['bea says hi', 'cleo says hi']);
    // system messages are still there, and unblocking brings her messages back
    expect(((await anaC.from('plan_messages').select('id').eq('plan_id', plan).eq('kind', 'system')).data ?? []).length).toBeGreaterThan(0);
    await anaC.rpc('unblock_member', { p_user: bea.id });
    expect((await bodiesFor(anaC)).sort()).toEqual(['bea says hi', 'cleo says hi']);
  });

  it('hides them from unread counts and the chats list preview too', async () => {
    const plan = await newPlan(hostC, host);
    await anaC.rpc('join_plan', { p_plan: plan });
    await beaC.rpc('join_plan', { p_plan: plan });
    await anaC.rpc('mark_read', { p_plan: plan });
    await anaC.rpc('block_member', { p_user: bea.id });
    await say(beaC, bea, plan, 'secret shouting');
    const row = ((await anaC.rpc('my_chats')).data as { plan_id: string; unread: number; last_body: string }[]).find((c) => c.plan_id === plan)!;
    expect(Number(row.unread)).toBe(0);
    expect(row.last_body).not.toBe('secret shouting');
    await anaC.rpc('unblock_member', { p_user: bea.id });
  });

  it('mutes pings about her: her plans, her joining, her messages', async () => {
    await anaC.rpc('block_member', { p_user: bea.id });
    // bea drops a plan: ana is not told, cleo is
    const beaPlan = await newPlan(beaC, bea);
    expect(await typesFor(ana, beaPlan)).toEqual([]);
    expect(await typesFor(cleo, beaPlan)).toEqual(['new_plan']);
    // bea joins ana's plan: ana (host) is not told
    const anaPlan = await newPlan(anaC, ana);
    await beaC.rpc('join_plan', { p_plan: anaPlan });
    expect(await typesFor(ana, anaPlan)).not.toContain('joined');
    // bea chats in a plan both are in: ana gets nothing, cleo does
    await cleoC.rpc('join_plan', { p_plan: anaPlan });
    await say(beaC, bea, anaPlan, 'hello everyone');
    expect(await typesFor(ana, anaPlan)).not.toContain('message');
    expect(await typesFor(cleo, anaPlan)).toContain('message');
    await anaC.rpc('unblock_member', { p_user: bea.id });
  });

  it('does not tell the blocked member anything: her own view is unchanged', async () => {
    await anaC.rpc('block_member', { p_user: bea.id });
    const plan = await newPlan(anaC, ana);
    await beaC.rpc('join_plan', { p_plan: plan }); // she can still join like anyone
    expect(((await beaC.from('plan_members').select('user_id').eq('plan_id', plan)).data ?? []).length).toBe(2);
    await anaC.rpc('unblock_member', { p_user: bea.id });
  });

  it('plan changes by a blocked host still reach people going (logistics matter)', async () => {
    await anaC.rpc('block_member', { p_user: bea.id });
    const plan = await newPlan(beaC, bea);
    await anaC.rpc('join_plan', { p_plan: plan });
    await beaC.from('plans').update({ title: 'Moved to Sunday' }).eq('id', plan);
    expect(await typesFor(ana, plan)).toContain('plan_edited');
    await anaC.rpc('unblock_member', { p_user: bea.id });
  });
});

describe('reporting a member', () => {
  const report = (c: SupabaseClient, who: TestUser, over: Record<string, unknown> = {}) =>
    c.rpc('report_member', { p_user: who.id, p_reason: 'uncomfortable', p_note: null, p_plan: null, p_block: false, ...over });

  it('goes to the admin; the reporter, the reported and everyone else cannot read it', async () => {
    expect((await report(anaC, bea, { p_note: 'she kept messaging me' })).error).toBeNull();
    for (const c of [anaC, beaC, cleoC, anonClient(), await signIn(noProfile)]) {
      expect(((await c.from('reports').select('id')).data ?? []).length).toBe(0);
    }
    const adminC = await signInAal2(admin);
    const { data } = await adminC.from('reports').select('reporter_id, reported_id, reason, note, status').eq('reported_id', bea.id);
    expect(data).toEqual([{ reporter_id: ana.id, reported_id: bea.id, reason: 'uncomfortable', note: 'she kept messaging me', status: 'open' }]);
  });

  it('an admin without MFA reads nothing', async () => {
    expect(((await (await signIn(admin)).from('reports').select('id')).data ?? []).length).toBe(0);
  });

  it('can include a block in the same tap', async () => {
    expect((await report(cleoC, outsider, { p_reason: 'spam_or_fake', p_block: true })).error).toBeNull();
    expect(await blocksOf(cleo)).toContain(outsider.id);
    await cleoC.rpc('unblock_member', { p_user: outsider.id });
  });

  it('only for real reasons, sensible notes, real members, never herself', async () => {
    expect((await report(anaC, cleo, { p_reason: 'because' })).error).not.toBeNull();
    expect((await report(anaC, cleo, { p_note: 'x'.repeat(301) })).error).not.toBeNull();
    expect((await report(anaC, ana)).error).not.toBeNull();
    expect((await report(anaC, removedMember)).error).not.toBeNull();
    expect((await anaC.rpc('report_member', { p_user: '00000000-0000-0000-0000-000000000000', p_reason: 'other' })).error).not.toBeNull();
  });

  it('visitors and non-members cannot report; no direct inserts', async () => {
    expect((await report(anonClient(), bea)).error).not.toBeNull();
    expect((await report(await signIn(noProfile), bea)).error).not.toBeNull();
    expect((await anaC.from('reports').insert({ reporter_id: ana.id, reported_id: bea.id, reason: 'other' })).error).not.toBeNull();
  });

  it('can point at a plan, but only one the reporter is in', async () => {
    const plan = await newPlan(hostC, host);
    await beaC.rpc('join_plan', { p_plan: plan });
    expect((await report(beaC, host, { p_plan: plan })).error).toBeNull();
    expect((await report(outsiderC, host, { p_plan: plan })).error).not.toBeNull(); // she is not in that plan
  });

  it('is limited to 5 reports a day per member', async () => {
    const reporter = await makeUser();
    const rc = await signIn(reporter);
    const results = [];
    for (let i = 0; i < 7; i++) results.push((await report(rc, cleo, { p_reason: 'other' })).error);
    expect(results.filter((e) => e === null)).toHaveLength(5);
  });

  it('the admin (with MFA) can resolve it; nobody else can change one', async () => {
    const adminC = await signInAal2(admin);
    const { data } = await adminC.from('reports').select('id').eq('reported_id', bea.id).limit(1).single();
    await anaC.from('reports').update({ status: 'resolved' }).eq('id', data!.id);
    expect((await svc.from('reports').select('status').eq('id', data!.id).single()).data?.status).toBe('open');
    expect((await adminC.from('reports').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: admin.id }).eq('id', data!.id)).error).toBeNull();
    expect((await svc.from('reports').select('status').eq('id', data!.id).single()).data?.status).toBe('resolved');
    expect((await adminC.from('reports').update({ reason: 'other' }).eq('id', data!.id)).error).not.toBeNull(); // only the status moves
  });
});
