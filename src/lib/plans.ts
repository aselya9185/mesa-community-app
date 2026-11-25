import { supabaseServer } from './supabase/server';
import { signAvatars } from './photos';
import { feedWindow } from './time';

export type Going = { id: string; name: string; photo?: string | null; photoPath?: string | null };
export type PlanRow = {
  id: string;
  title: string;
  starts_at: string;
  place_name: string;
  maps_url: string | null;
  booking_url: string | null;
  free_plus_one: boolean;
  status: 'active' | 'cancelled';
  host_id: string;
  going: Going[];
};

const SELECT = 'id, title, starts_at, place_name, maps_url, booking_url, free_plus_one, status, host_id, plan_members(user_id, joined_at, profiles(id, name, photo_path))';

type Raw = Omit<PlanRow, 'going'> & { plan_members: { user_id: string; joined_at: string; profiles: { id: string; name: string; photo_path: string | null } | { id: string; name: string; photo_path: string | null }[] | null }[] };

function shape(r: Raw): PlanRow {
  const { plan_members, ...rest } = r;
  const going = [...plan_members]
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
    .map((m) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter((p): p is { id: string; name: string; photo_path: string | null } => !!p)
    .map((p) => ({ id: p.id, name: p.name, photoPath: p.photo_path }));
  return { ...rest, going } as unknown as PlanRow;
}

/** "this week": active plans starting in the next 7 days. Row level security decides what she may see. */
export async function getFeed(): Promise<PlanRow[]> {
  const supabase = await supabaseServer();
  const { from, to } = feedWindow();
  const { data } = await supabase.from('plans').select(SELECT).eq('status', 'active').gte('starts_at', from).lt('starts_at', to).order('starts_at');
  return withPhotos(((data ?? []) as unknown as Raw[]).map(shape));
}

/**
 * The plans tab: this week's plans, plus every upcoming plan she hosts or has joined. Without the second part a plan she
 * dropped for later (say in ten days) would be missing from her own list. Other people's plans keep the 7-day window.
 */
export async function getFeedFor(userId: string): Promise<PlanRow[]> {
  const [feed, mine] = await Promise.all([getFeed(), getMyPlans(userId)]);
  const byId = new Map(feed.map((p) => [p.id, p]));
  for (const p of mine) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('plans').select(SELECT).eq('id', id).maybeSingle();
  return data ? (await withPhotos([shape(data as unknown as Raw)]))[0]! : null;
}

/** plans she is going to or hosts, soonest first (the chats tab for now) */
export async function getMyPlans(userId: string): Promise<PlanRow[]> {
  const supabase = await supabaseServer();
  const { data: mine } = await supabase.from('plan_members').select('plan_id').eq('user_id', userId);
  const ids = (mine ?? []).map((m) => m.plan_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase.from('plans').select(SELECT).in('id', ids).eq('status', 'active').gte('starts_at', new Date().toISOString()).order('starts_at');
  return withPhotos(((data ?? []) as unknown as Raw[]).map(shape));
}

async function withPhotos(plans: PlanRow[]): Promise<PlanRow[]> {
  const urls = await signAvatars(plans.flatMap((p) => p.going.map((g) => g.photoPath)));
  return plans.map((p) => ({
    ...p,
    going: p.going.map(({ photoPath, ...g }) => ({ ...g, photo: photoPath ? (urls.get(photoPath) ?? null) : null })),
  }));
}

export function mapsLink(plan: Pick<PlanRow, 'maps_url' | 'place_name'>): string {
  return plan.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.place_name + ' Barcelona')}`;
}

// ---- M4: booking, +1, poll ----------------------------------------------------------

export type BookingState = 'not_booked' | 'booked' | 'covered';
export type PlusOneStatus = 'none' | 'pending' | 'yours' | 'taken' | 'given';
export type PollOption = { id: string; label: string; votes: number; mine: boolean };

export type PlanExtras = {
  /** everyone's badge: covered already reads as booked (the database does that) */
  badges: Record<string, 'booked' | 'not_booked'>;
  /** her own real state, null when the plan has no booking */
  myState: BookingState | null;
  plusOne: PlusOneStatus;
  /** host only: the real state of each going member, and who holds the +1 */
  hostView: { states: Record<string, BookingState>; holder: string | null } | null;
  poll: PollOption[];
  iAddedOption: boolean;
  canAddOption: boolean;
};

const DEFAULT_ORDER = ['matcha', 'coffee', 'a walk', 'brunch'];
/** defaults first in their usual order, then custom ones in the order they were added */
function rank(label: string): number {
  const i = DEFAULT_ORDER.indexOf(label.toLowerCase());
  return i === -1 ? 100 : i;
}

export async function getExtras(plan: PlanRow, meId: string): Promise<PlanExtras> {
  const supabase = await supabaseServer();
  const iAmIn = plan.going.some((g) => g.id === meId);
  const isHost = plan.host_id === meId;

  const [badgesRes, plusRes, optionsRes, countsRes, myVoteRes, myBookingRes, hostBookingsRes, grantRes] = await Promise.all([
    iAmIn ? supabase.rpc('booking_states', { p_plan: plan.id }) : Promise.resolve({ data: [] }),
    iAmIn ? supabase.rpc('plus_one_status', { p_plan: plan.id }) : Promise.resolve({ data: 'none' }),
    supabase.from('plan_poll_options').select('id, label, member_added, added_by').eq('plan_id', plan.id).order('created_at'),
    iAmIn ? supabase.rpc('poll_counts', { p_plan: plan.id }) : Promise.resolve({ data: [] }),
    iAmIn ? supabase.from('plan_poll_votes').select('option_id').eq('plan_id', plan.id).eq('user_id', meId).maybeSingle() : Promise.resolve({ data: null }),
    iAmIn ? supabase.from('plan_bookings').select('state').eq('plan_id', plan.id).eq('user_id', meId).maybeSingle() : Promise.resolve({ data: null }),
    isHost ? supabase.from('plan_bookings').select('user_id, state').eq('plan_id', plan.id) : Promise.resolve({ data: [] }),
    isHost ? supabase.from('plus_one_grants').select('user_id').eq('plan_id', plan.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const badges: PlanExtras['badges'] = {};
  for (const r of (badgesRes.data ?? []) as { user_id: string; state: string }[]) badges[r.user_id] = r.state === 'booked' ? 'booked' : 'not_booked';

  const counts = new Map<string, number>(((countsRes.data ?? []) as { option_id: string; votes: number | string }[]).map((c) => [c.option_id, Number(c.votes)]));
  const myVote = (myVoteRes.data as { option_id: string } | null)?.option_id ?? null;
  const options = (optionsRes.data ?? []) as { id: string; label: string; member_added: boolean; added_by: string | null }[];

  const hostStates: Record<string, BookingState> = {};
  for (const r of (hostBookingsRes.data ?? []) as { user_id: string; state: BookingState }[]) hostStates[r.user_id] = r.state;

  const iAddedOption = options.some((o) => o.member_added && o.added_by === meId);
  return {
    badges,
    myState: ((myBookingRes.data as { state: BookingState } | null)?.state ?? null) as BookingState | null,
    plusOne: ((plusRes.data as PlusOneStatus | null) ?? 'none'),
    hostView: isHost ? { states: hostStates, holder: (grantRes.data as { user_id: string } | null)?.user_id ?? null } : null,
    poll: [...options]
      .sort((a, b) => rank(a.label) - rank(b.label))
      .map((o) => ({ id: o.id, label: o.label, votes: counts.get(o.id) ?? 0, mine: o.id === myVote })),
    iAddedOption,
    canAddOption: iAmIn && plan.status === 'active' && !iAddedOption && options.length < 8,
  };
}
