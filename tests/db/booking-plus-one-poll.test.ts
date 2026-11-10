import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, type TestUser } from './helpers';

const svc = serviceClient();
const future = () => new Date(Date.now() + 3 * 86400_000).toISOString();

let keep: string | undefined; // the main plan survives between tests
async function newPlan(c: SupabaseClient, over: Record<string, unknown> = {}) {
  // stay under the 10-plans-a-day limit: keep only the main plan between tests
  await svc.from('plans').delete().eq('host_id', host.id).neq('id', keep ?? '00000000-0000-0000-0000-000000000000');
  const r = await c.rpc('create_plan', {
    p_title: 'Zumba',
    p_starts_at: future(),
    p_place_name: 'Studio',
    p_maps_url: null,
    p_booking_url: 'https://studio.example/book',
    p_free_plus_one: true,
    p_host_booked: false,
    p_poll: ['matcha', 'coffee', 'a walk', 'brunch'],
    ...over,
  });
  expect(r.error).toBeNull();
  return r.data as string;
}
async function stateOf(plan: string, user: string): Promise<string | undefined> {
  const { data } = await svc.from('plan_bookings').select('state').eq('plan_id', plan).eq('user_id', user).maybeSingle();
  return data?.state as string | undefined;
}

let host: TestUser, anna: TestUser, carla: TestUser, dana: TestUser, outsider: TestUser;
let hostC: SupabaseClient, annaC: SupabaseClient, carlaC: SupabaseClient, danaC: SupabaseClient, outsiderC: SupabaseClient;
let plan: string;

beforeAll(async () => {
  [host, anna, carla, dana, outsider] = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
  [hostC, annaC, carlaC, danaC, outsiderC] = await Promise.all([signIn(host), signIn(anna), signIn(carla), signIn(dana), signIn(outsider)]);
  plan = await newPlan(hostC);
  keep = plan;
  for (const c of [annaC, carlaC, danaC]) expect((await c.rpc('join_plan', { p_plan: plan })).error).toBeNull();
});
afterAll(async () => {
  await svc.from('plans').delete().eq('host_id', host.id);
  await cleanup();
});

describe('booking states', () => {
  it('exist only when the plan has a booking link', async () => {
    const noLink = await newPlan(hostC, { p_booking_url: null, p_free_plus_one: false });
    await annaC.rpc('join_plan', { p_plan: noLink });
    expect(await stateOf(noLink, anna.id)).toBeUndefined();
    expect((await annaC.rpc('set_booking', { p_plan: noLink, p_booked: true })).error).not.toBeNull();
  });

  it('start as "not booked" for everyone who joins, host included', async () => {
    expect(await stateOf(plan, host.id)).toBe('not_booked');
    expect(await stateOf(plan, anna.id)).toBe('not_booked');
  });

  it('the host can say she booked when she drops the plan', async () => {
    const p = await newPlan(hostC, { p_host_booked: true });
    expect(await stateOf(p, host.id)).toBe('booked');
  });

  it('a member can switch her own state back and forth', async () => {
    expect((await annaC.rpc('set_booking', { p_plan: plan, p_booked: true })).error).toBeNull();
    expect(await stateOf(plan, anna.id)).toBe('booked');
    expect((await annaC.rpc('set_booking', { p_plan: plan, p_booked: false })).error).toBeNull();
    expect(await stateOf(plan, anna.id)).toBe('not_booked');
  });

  it('only people in the plan can set one', async () => {
    expect((await outsiderC.rpc('set_booking', { p_plan: plan, p_booked: true })).error).not.toBeNull();
    expect((await anonClient().rpc('set_booking', { p_plan: plan, p_booked: true })).error).not.toBeNull();
  });

  it('the table shows you your own row and the host everyone; others nothing', async () => {
    const own = await carlaC.from('plan_bookings').select('user_id').eq('plan_id', plan);
    expect((own.data ?? []).map((r) => r.user_id)).toEqual([carla.id]);
    const all = await hostC.from('plan_bookings').select('user_id').eq('plan_id', plan);
    expect((all.data ?? []).length).toBe(4);
    expect(((await outsiderC.from('plan_bookings').select('user_id').eq('plan_id', plan)).data ?? []).length).toBe(0);
    expect(((await anonClient().from('plan_bookings').select('user_id')).data ?? []).length).toBe(0);
  });

  it('joined members see everyone’s booked badge, outsiders see nothing', async () => {
    await carlaC.rpc('set_booking', { p_plan: plan, p_booked: true });
    const { data } = await annaC.rpc('booking_states', { p_plan: plan });
    const map = Object.fromEntries((data as { user_id: string; state: string }[]).map((r) => [r.user_id, r.state]));
    expect(map[carla.id]).toBe('booked');
    expect(Object.keys(map)).toHaveLength(4);
    const out = await outsiderC.rpc('booking_states', { p_plan: plan });
    expect((out.data ?? []) as unknown[]).toHaveLength(0);
    await carlaC.rpc('set_booking', { p_plan: plan, p_booked: false });
  });

  it('adding a link later gives everyone a state; removing it clears them', async () => {
    const p = await newPlan(hostC, { p_booking_url: null, p_free_plus_one: false });
    await annaC.rpc('join_plan', { p_plan: p });
    await hostC.from('plans').update({ booking_url: 'https://x.example/book' }).eq('id', p);
    expect(await stateOf(p, anna.id)).toBe('not_booked');
    expect(await stateOf(p, host.id)).toBe('not_booked');
    await hostC.from('plans').update({ booking_url: null }).eq('id', p);
    expect(await stateOf(p, anna.id)).toBeUndefined();
  });
});

describe('the free +1 (host only, to a joined member who has not booked)', () => {
  it('only the host can give it', async () => {
    expect((await annaC.rpc('assign_plus_one', { p_plan: plan, p_user: carla.id })).error).not.toBeNull();
    expect((await outsiderC.rpc('assign_plus_one', { p_plan: plan, p_user: carla.id })).error).not.toBeNull();
    expect((await anonClient().rpc('assign_plus_one', { p_plan: plan, p_user: carla.id })).error).not.toBeNull();
    const { data } = await svc.from('plus_one_grants').select('user_id').eq('plan_id', plan);
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a member who already booked, an outsider, and the host herself', async () => {
    await annaC.rpc('set_booking', { p_plan: plan, p_booked: true });
    expect((await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: anna.id })).error).not.toBeNull();
    expect((await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: outsider.id })).error).not.toBeNull();
    expect((await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: host.id })).error).not.toBeNull();
    await annaC.rpc('set_booking', { p_plan: plan, p_booked: false });
  });

  it('refuses plans without a free +1 and plans with no booking', async () => {
    const noPlus = await newPlan(hostC, { p_free_plus_one: false });
    await carlaC.rpc('join_plan', { p_plan: noPlus });
    expect((await hostC.rpc('assign_plus_one', { p_plan: noPlus, p_user: carla.id })).error).not.toBeNull();
    const noBooking = await newPlan(hostC, { p_booking_url: null });
    await carlaC.rpc('join_plan', { p_plan: noBooking });
    expect((await hostC.rpc('assign_plus_one', { p_plan: noBooking, p_user: carla.id })).error).not.toBeNull();
  });

  it('gives it to a joined member who has not booked: she becomes "covered"', async () => {
    expect((await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: carla.id })).error).toBeNull();
    expect(await stateOf(plan, carla.id)).toBe('covered');
  });

  it('only one per plan until the host takes it back', async () => {
    expect((await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: dana.id })).error).not.toBeNull();
    expect((await annaC.rpc('revoke_plus_one', { p_plan: plan })).error).not.toBeNull();
    expect((await carlaC.rpc('revoke_plus_one', { p_plan: plan })).error).not.toBeNull();
    expect(await stateOf(plan, carla.id)).toBe('covered');
  });

  it('others cannot see who got it: not in the table, and her badge reads "booked"', async () => {
    for (const c of [annaC, danaC, outsiderC, anonClient()]) {
      expect(((await c.from('plus_one_grants').select('user_id')).data ?? []).length).toBe(0);
    }
    expect(((await carlaC.from('plus_one_grants').select('user_id').eq('plan_id', plan)).data ?? []).map((r) => r.user_id)).toEqual([carla.id]);
    expect(((await hostC.from('plus_one_grants').select('user_id').eq('plan_id', plan)).data ?? []).map((r) => r.user_id)).toEqual([carla.id]);
    const { data } = await annaC.rpc('booking_states', { p_plan: plan });
    const states = (data as { user_id: string; state: string }[]).map((r) => r.state);
    expect(states).not.toContain('covered');
  });

  it('tells each person only what she should know', async () => {
    const status = async (c: SupabaseClient) => (await c.rpc('plus_one_status', { p_plan: plan })).data;
    expect(await status(hostC)).toBe('given');
    expect(await status(carlaC)).toBe('yours');
    expect(await status(annaC)).toBe('taken');
    expect(await status(outsiderC)).toBe('none');
  });

  it('a covered member cannot change her booking state', async () => {
    expect((await carlaC.rpc('set_booking', { p_plan: plan, p_booked: false })).error).not.toBeNull();
    expect(await stateOf(plan, carla.id)).toBe('covered');
  });

  it('the host can take it back: the member goes to "not booked" and it is pending again', async () => {
    expect((await hostC.rpc('revoke_plus_one', { p_plan: plan })).error).toBeNull();
    expect(await stateOf(plan, carla.id)).toBe('not_booked');
    expect((await annaC.rpc('plus_one_status', { p_plan: plan })).data).toBe('pending');
    expect((await hostC.rpc('plus_one_status', { p_plan: plan })).data).toBe('pending');
  });

  it('leaving or being removed frees the +1', async () => {
    await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: dana.id });
    await danaC.rpc('leave_plan', { p_plan: plan });
    expect(((await svc.from('plus_one_grants').select('user_id').eq('plan_id', plan)).data ?? []).length).toBe(0);
    await danaC.rpc('join_plan', { p_plan: plan });
    await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: dana.id });
    await hostC.rpc('remove_from_plan', { p_plan: plan, p_user: dana.id });
    expect(((await svc.from('plus_one_grants').select('user_id').eq('plan_id', plan)).data ?? []).length).toBe(0);
  });

  it('switching the free +1 off takes it back from whoever had it', async () => {
    await hostC.rpc('assign_plus_one', { p_plan: plan, p_user: carla.id });
    await hostC.from('plans').update({ free_plus_one: false }).eq('id', plan);
    expect(((await svc.from('plus_one_grants').select('user_id').eq('plan_id', plan)).data ?? []).length).toBe(0);
    expect(await stateOf(plan, carla.id)).toBe('not_booked');
    await hostC.from('plans').update({ free_plus_one: true }).eq('id', plan);
  });

  it('nobody writes grants or bookings directly', async () => {
    expect((await hostC.from('plus_one_grants').insert({ plan_id: plan, user_id: anna.id })).error).not.toBeNull();
    expect((await annaC.from('plan_bookings').update({ state: 'booked' }).eq('plan_id', plan)).error).not.toBeNull();
    expect((await annaC.from('plan_bookings').insert({ plan_id: plan, user_id: outsider.id, state: 'booked' })).error).not.toBeNull();
  });
});

describe('"plans after" poll', () => {
  const optionIds = async (p: string) => (await svc.from('plan_poll_options').select('id, label, is_custom').eq('plan_id', p)).data ?? [];

  it('is created with the plan: chosen defaults plus a custom one', async () => {
    const p = await newPlan(hostC, { p_poll: ['matcha', 'coffee', 'tapas run'] });
    const opts = await optionIds(p);
    expect(opts.map((o) => o.label).sort()).toEqual(['coffee', 'matcha', 'tapas run']);
    expect(opts.find((o) => o.label === 'tapas run')?.is_custom).toBe(true);
    expect(opts.find((o) => o.label === 'matcha')?.is_custom).toBe(false);
  });

  it('cleans the list: trims, drops blanks and duplicates, caps at 8', async () => {
    const p = await newPlan(hostC, { p_poll: [' matcha ', 'MATCHA', '', '   ', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    const opts = await optionIds(p);
    expect(opts.length).toBe(8);
    expect(opts.filter((o) => o.label.toLowerCase() === 'matcha')).toHaveLength(1);
  });

  it('every member can read the options; outsiders and visitors cannot read nothing extra', async () => {
    expect(((await annaC.from('plan_poll_options').select('id').eq('plan_id', plan)).data ?? []).length).toBe(4);
    expect(((await anonClient().from('plan_poll_options').select('id')).data ?? []).length).toBe(0);
  });

  it('joined members vote once and can change their vote', async () => {
    const [first, second] = (await optionIds(plan)).map((o) => o.id as string);
    expect((await annaC.rpc('vote_plan', { p_plan: plan, p_option: first })).error).toBeNull();
    expect((await annaC.rpc('vote_plan', { p_plan: plan, p_option: second })).error).toBeNull();
    const { data } = await svc.from('plan_poll_votes').select('option_id').eq('plan_id', plan).eq('user_id', anna.id);
    expect(data).toEqual([{ option_id: second }]);
  });

  it('outsiders cannot vote; an option of another plan is refused', async () => {
    const [first] = (await optionIds(plan)).map((o) => o.id as string);
    expect((await outsiderC.rpc('vote_plan', { p_plan: plan, p_option: first })).error).not.toBeNull();
    const other = await newPlan(hostC);
    const [otherOpt] = (await optionIds(other)).map((o) => o.id as string);
    expect((await annaC.rpc('vote_plan', { p_plan: plan, p_option: otherOpt })).error).not.toBeNull();
  });

  it('counts are visible to people in the plan; individual votes only to their owner', async () => {
    const [first] = (await optionIds(plan)).map((o) => o.id as string);
    await carlaC.rpc('vote_plan', { p_plan: plan, p_option: first });
    const counts = (await carlaC.rpc('poll_counts', { p_plan: plan })).data as { option_id: string; votes: number }[];
    expect(counts.reduce((n, c) => n + Number(c.votes), 0)).toBe(2);
    expect(((await outsiderC.rpc('poll_counts', { p_plan: plan })).data ?? []) as unknown[]).toHaveLength(0);
    const seen = (await carlaC.from('plan_poll_votes').select('user_id')).data ?? [];
    expect(seen.every((r) => r.user_id === carla.id)).toBe(true);
    expect(((await outsiderC.from('plan_poll_votes').select('user_id')).data ?? []).length).toBe(0);
  });

  it('a vote can be withdrawn, and leaving the plan removes her vote', async () => {
    expect((await carlaC.rpc('clear_vote', { p_plan: plan })).error).toBeNull();
    expect(((await svc.from('plan_poll_votes').select('user_id').eq('plan_id', plan).eq('user_id', carla.id)).data ?? []).length).toBe(0);
    await annaC.rpc('leave_plan', { p_plan: plan });
    expect(((await svc.from('plan_poll_votes').select('user_id').eq('plan_id', plan).eq('user_id', anna.id)).data ?? []).length).toBe(0);
    await annaC.rpc('join_plan', { p_plan: plan });
  });

  it('members can add one custom option each; labels stay unique and total at most 8', async () => {
    const p = await newPlan(hostC, { p_poll: ['matcha'] });
    await annaC.rpc('join_plan', { p_plan: p });
    await carlaC.rpc('join_plan', { p_plan: p });
    expect((await annaC.rpc('add_poll_option', { p_plan: p, p_label: 'sunset walk' })).error).toBeNull();
    expect((await annaC.rpc('add_poll_option', { p_plan: p, p_label: 'second try' })).error).not.toBeNull(); // one each
    expect((await carlaC.rpc('add_poll_option', { p_plan: p, p_label: 'SUNSET WALK' })).error).not.toBeNull(); // duplicate
    expect((await carlaC.rpc('add_poll_option', { p_plan: p, p_label: '' })).error).not.toBeNull();
    expect((await carlaC.rpc('add_poll_option', { p_plan: p, p_label: 'x'.repeat(31) })).error).not.toBeNull();
    expect((await outsiderC.rpc('add_poll_option', { p_plan: p, p_label: 'sneaky' })).error).not.toBeNull();
  });

  it('nobody writes options or votes directly', async () => {
    expect((await annaC.from('plan_poll_options').insert({ plan_id: plan, label: 'direct' })).error).not.toBeNull();
    const [first] = (await optionIds(plan)).map((o) => o.id as string);
    expect((await annaC.from('plan_poll_votes').insert({ plan_id: plan, user_id: anna.id, option_id: first })).error).not.toBeNull();
  });

  it('a cancelled plan takes no more votes', async () => {
    const p = await newPlan(hostC);
    await annaC.rpc('join_plan', { p_plan: p });
    const [opt] = (await optionIds(p)).map((o) => o.id as string);
    await hostC.rpc('cancel_plan', { p_plan: p });
    expect((await annaC.rpc('vote_plan', { p_plan: p, p_option: opt })).error).not.toBeNull();
  });
});
