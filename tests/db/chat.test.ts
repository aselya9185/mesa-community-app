import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, type TestUser } from './helpers';

const svc = serviceClient();
const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();

async function newPlan(c: SupabaseClient, over: Record<string, unknown> = {}) {
  await svc.from('plans').delete().eq('host_id', host.id).neq('id', keep ?? '00000000-0000-0000-0000-000000000000'); // stay under the daily limit
  const r = await c.rpc('create_plan', {
    p_title: 'Zumba', p_starts_at: future(), p_place_name: 'Studio', p_maps_url: null,
    p_booking_url: 'https://studio.example/book', p_free_plus_one: true, p_host_booked: false, p_poll: [], ...over,
  });
  expect(r.error).toBeNull();
  return r.data as string;
}
const say = (c: SupabaseClient, user: TestUser, plan: string, body: string) =>
  c.from('plan_messages').insert({ plan_id: plan, sender_id: user.id, kind: 'user', body });
async function messages(plan: string) {
  const { data } = await svc.from('plan_messages').select('kind, event, body, sender_id').eq('plan_id', plan).order('created_at').order('id');
  return data ?? [];
}
const systemEvents = async (plan: string) => (await messages(plan)).filter((m) => m.kind === 'system').map((m) => m.event);

let host: TestUser, anna: TestUser, carla: TestUser, outsider: TestUser, removedMember: TestUser, noProfile: TestUser;
let hostC: SupabaseClient, annaC: SupabaseClient, carlaC: SupabaseClient, outsiderC: SupabaseClient;
let keep: string | undefined;
let plan: string;

beforeAll(async () => {
  host = await makeUser({ name: 'Hostess' });
  anna = await makeUser({ name: 'Anna' });
  carla = await makeUser({ name: 'Carla' });
  outsider = await makeUser({ name: 'Nina' });
  removedMember = await makeUser({ name: 'Gone', status: 'removed' });
  noProfile = await makeUser({ withProfile: false });
  [hostC, annaC, carlaC, outsiderC] = await Promise.all([signIn(host), signIn(anna), signIn(carla), signIn(outsider)]);
  plan = await newPlan(hostC);
  keep = plan;
  await annaC.rpc('join_plan', { p_plan: plan });
  await carlaC.rpc('join_plan', { p_plan: plan });
});
afterAll(async () => {
  await svc.from('plans').delete().eq('host_id', host.id);
  await cleanup();
});

describe('only people in the plan can read or write its chat', () => {
  it('members of the plan can post and read each other', async () => {
    expect((await say(annaC, anna, plan, 'who is bringing water?')).error).toBeNull();
    const { data } = await carlaC.from('plan_messages').select('body, kind').eq('plan_id', plan).eq('kind', 'user');
    expect(data?.map((m) => m.body)).toContain('who is bringing water?');
  });

  it('outsiders, visitors, pending and removed members read nothing', async () => {
    for (const c of [outsiderC, anonClient(), await signIn(noProfile), await signIn(removedMember)]) {
      expect(((await c.from('plan_messages').select('id').eq('plan_id', plan)).data ?? []).length).toBe(0);
    }
  });

  it('...and cannot post', async () => {
    expect((await say(outsiderC, outsider, plan, 'hi')).error).not.toBeNull();
    expect((await say(anonClient(), outsider, plan, 'hi')).error).not.toBeNull();
    expect((await say(await signIn(removedMember), removedMember, plan, 'hi')).error).not.toBeNull();
  });

  it('cannot post as someone else', async () => {
    expect((await say(annaC, carla, plan, 'i am carla')).error).not.toBeNull();
  });

  it('leaving takes the chat away immediately; rejoining brings it back', async () => {
    await carlaC.rpc('leave_plan', { p_plan: plan });
    expect(((await carlaC.from('plan_messages').select('id').eq('plan_id', plan)).data ?? []).length).toBe(0);
    expect((await say(carlaC, carla, plan, 'still here?')).error).not.toBeNull();
    await carlaC.rpc('join_plan', { p_plan: plan });
    expect(((await carlaC.from('plan_messages').select('id').eq('plan_id', plan)).data ?? []).length).toBeGreaterThan(0);
  });

  it('being removed by the host takes the chat away and blocks coming back', async () => {
    const p = await newPlan(hostC);
    await carlaC.rpc('join_plan', { p_plan: p });
    await hostC.rpc('remove_from_plan', { p_plan: p, p_user: carla.id });
    expect(((await carlaC.from('plan_messages').select('id').eq('plan_id', p)).data ?? []).length).toBe(0);
    expect((await say(carlaC, carla, p, 'let me in')).error).not.toBeNull();
  });

  it('a cancelled plan keeps its chat readable but takes no new messages', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    await hostC.rpc('cancel_plan', { p_plan: p });
    expect(((await annaC.from('plan_messages').select('id').eq('plan_id', p)).data ?? []).length).toBeGreaterThan(0);
    expect((await say(annaC, anna, p, 'is it off?')).error).not.toBeNull();
  });
});

describe('messages cannot be forged or changed', () => {
  it('clients cannot write system messages or set an event', async () => {
    const forged = await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: null, kind: 'system', event: 'join', body: 'carla is in' });
    expect(forged.error).not.toBeNull();
    const withEvent = await annaC.from('plan_messages').insert({ plan_id: plan, sender_id: anna.id, kind: 'user', event: 'cancelled', body: 'plan cancelled' });
    expect(withEvent.error).not.toBeNull();
  });

  it('nobody edits or deletes a message', async () => {
    const { data } = await svc.from('plan_messages').select('id, body').eq('plan_id', plan).eq('kind', 'user').limit(1).single();
    await annaC.from('plan_messages').update({ body: 'changed' }).eq('id', data!.id);
    await annaC.from('plan_messages').delete().eq('id', data!.id);
    const again = await svc.from('plan_messages').select('body').eq('id', data!.id).single();
    expect(again.data?.body).toBe(data!.body);
  });

  it('rejects empty and over-long messages', async () => {
    expect((await say(annaC, anna, plan, '')).error).not.toBeNull();
    expect((await say(annaC, anna, plan, 'x'.repeat(1001))).error).not.toBeNull();
    expect((await say(annaC, anna, plan, 'x'.repeat(1000))).error).toBeNull();
  });

  it('slows down a flood: at most 20 a minute per person', async () => {
    const spammer = await makeUser();
    const sc = await signIn(spammer);
    await sc.rpc('join_plan', { p_plan: plan });
    const results = [];
    for (let i = 0; i < 24; i++) results.push((await say(sc, spammer, plan, `msg ${i}`)).error);
    expect(results.filter((e) => e === null)).toHaveLength(20);
  });
});

describe('system messages', () => {
  it('say who dropped, joined, left and was removed, once each', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    await annaC.rpc('join_plan', { p_plan: p }); // twice: no second message
    await carlaC.rpc('join_plan', { p_plan: p });
    await annaC.rpc('leave_plan', { p_plan: p });
    await hostC.rpc('remove_from_plan', { p_plan: p, p_user: carla.id });
    expect(await systemEvents(p)).toEqual(['created', 'join', 'join', 'leave', 'removed']);
    const bodies = (await messages(p)).map((m) => m.body);
    expect(bodies).toContain('hostess dropped this plan');
    expect(bodies).toContain('anna is in');
    expect(bodies).toContain('anna left');
    expect(bodies).toContain('carla was removed from the plan');
  });

  it('announce edits and the cancellation', async () => {
    const p = await newPlan(hostC);
    await hostC.from('plans').update({ title: 'Zumba XL' }).eq('id', p);
    await hostC.from('plans').update({ free_plus_one: false }).eq('id', p); // not a visible edit: no message
    await hostC.rpc('cancel_plan', { p_plan: p });
    await hostC.rpc('cancel_plan', { p_plan: p }); // idempotent: one message
    expect(await systemEvents(p)).toEqual(['created', 'edited', 'cancelled']);
    expect((await messages(p)).map((m) => m.body)).toContain('hostess cancelled this plan');
  });

  it('the +1 messages never name anyone', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    await hostC.rpc('assign_plus_one', { p_plan: p, p_user: anna.id });
    const given = (await messages(p)).filter((m) => m.event === 'plus_given');
    expect(given).toHaveLength(1);
    expect(given[0]!.body).toBe('the free +1 is taken');
    expect(given[0]!.body.toLowerCase()).not.toContain('anna');
    await hostC.rpc('revoke_plus_one', { p_plan: p });
    expect((await systemEvents(p)).filter((e) => e === 'plus_open')).toHaveLength(1);
  });

  it('a +1 freed because she left says "open again" once', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    await hostC.rpc('assign_plus_one', { p_plan: p, p_user: anna.id });
    await annaC.rpc('leave_plan', { p_plan: p });
    expect((await systemEvents(p)).filter((e) => e === 'plus_open')).toHaveLength(1);
  });

  it('deleting a plan does not trip over its own system messages', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    expect((await svc.from('plans').delete().eq('id', p)).error).toBeNull();
  });
});

describe('unread counts and the chats list', () => {
  it('count other people’s messages since she last read; reading clears them', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    await carlaC.rpc('join_plan', { p_plan: p });
    await carlaC.rpc('mark_read', { p_plan: p });
    await say(annaC, anna, p, 'one');
    await say(annaC, anna, p, 'two');
    await say(carlaC, carla, p, 'mine does not count');
    const chats = (await carlaC.rpc('my_chats')).data as { plan_id: string; unread: number; last_body: string }[];
    const mine = chats.find((c) => c.plan_id === p)!;
    expect(Number(mine.unread)).toBe(2);
    expect(mine.last_body).toBe('mine does not count');
    await carlaC.rpc('mark_read', { p_plan: p });
    const after = ((await carlaC.rpc('my_chats')).data as { plan_id: string; unread: number }[]).find((c) => c.plan_id === p)!;
    expect(Number(after.unread)).toBe(0);
  });

  it('only list plans she is in, and nothing for outsiders or visitors', async () => {
    const chats = (await outsiderC.rpc('my_chats')).data as { plan_id: string }[];
    expect(chats ?? []).toHaveLength(0);
    expect((await anonClient().rpc('my_chats')).error).not.toBeNull();
    expect((await outsiderC.rpc('mark_read', { p_plan: plan })).error).toBeNull(); // harmless no-op
  });
});

describe('realtime delivery respects the same rules', () => {
  it('a joined member receives new messages live; an outsider receives none', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    // realtime needs the member's own token, or it would listen as an anonymous visitor
    for (const c of [annaC, outsiderC]) await c.realtime.setAuth((await c.auth.getSession()).data.session!.access_token);
    const got = (client: SupabaseClient, label: string) => {
      const seen: string[] = [];
      const channel = client
        .channel(`t-${label}-${p}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${p}` }, (payload) => {
          seen.push((payload.new as { body: string }).body);
        });
      return { seen, channel };
    };
    const member = got(annaC, 'member');
    const stranger = got(outsiderC, 'stranger');
    await Promise.all([
      new Promise<void>((res, rej) => member.channel.subscribe((s) => (s === 'SUBSCRIBED' ? res() : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? rej(new Error(s)) : undefined))),
      new Promise<void>((res, rej) => stranger.channel.subscribe((s) => (s === 'SUBSCRIBED' ? res() : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? rej(new Error(s)) : undefined))),
    ]);
    await say(hostC, host, p, 'see you at 7!');
    for (let i = 0; i < 30 && member.seen.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 500));
    expect(member.seen).toContain('see you at 7!');
    expect(stranger.seen).toHaveLength(0);
    await annaC.removeChannel(member.channel);
    await outsiderC.removeChannel(stranger.channel);
  });
});
