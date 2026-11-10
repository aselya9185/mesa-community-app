import { supabaseServer } from './supabase/server';
import { feedWindow } from './time';

export type Going = { id: string; name: string };
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

const SELECT = 'id, title, starts_at, place_name, maps_url, booking_url, free_plus_one, status, host_id, plan_members(user_id, joined_at, profiles(id, name))';

type Raw = Omit<PlanRow, 'going'> & { plan_members: { user_id: string; joined_at: string; profiles: { id: string; name: string } | { id: string; name: string }[] | null }[] };

function shape(r: Raw): PlanRow {
  const { plan_members, ...rest } = r;
  const going = [...plan_members]
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
    .map((m) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter((p): p is { id: string; name: string } => !!p)
    .map((p) => ({ id: p.id, name: p.name }));
  return { ...rest, going };
}

/** "this week": active plans starting in the next 7 days. Row level security decides what she may see. */
export async function getFeed(): Promise<PlanRow[]> {
  const supabase = await supabaseServer();
  const { from, to } = feedWindow();
  const { data } = await supabase.from('plans').select(SELECT).eq('status', 'active').gte('starts_at', from).lt('starts_at', to).order('starts_at');
  return ((data ?? []) as unknown as Raw[]).map(shape);
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('plans').select(SELECT).eq('id', id).maybeSingle();
  return data ? shape(data as unknown as Raw) : null;
}

/** plans she is going to or hosts, soonest first (the chats tab for now) */
export async function getMyPlans(userId: string): Promise<PlanRow[]> {
  const supabase = await supabaseServer();
  const { data: mine } = await supabase.from('plan_members').select('plan_id').eq('user_id', userId);
  const ids = (mine ?? []).map((m) => m.plan_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase.from('plans').select(SELECT).in('id', ids).eq('status', 'active').gte('starts_at', new Date().toISOString()).order('starts_at');
  return ((data ?? []) as unknown as Raw[]).map(shape);
}

export function mapsLink(plan: Pick<PlanRow, 'maps_url' | 'place_name'>): string {
  return plan.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.place_name + ' Barcelona')}`;
}
