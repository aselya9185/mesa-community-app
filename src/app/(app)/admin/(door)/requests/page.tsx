import type { Metadata } from 'next';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { RequestsClient, type LinkRequestItem, type RequestItem } from '@/components/RequestsClient';
import { supabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'door list · mesa' };

type Status = 'pending' | 'approved' | 'rejected';
const STATUSES: Status[] = ['pending', 'approved', 'rejected'];

const pretty = (e164: string) => parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
/** the member who vouched: her handle comes from the private handle table (the admin may read it) */
type Vouched = { name: string; member_instagram: { handle: string } | { handle: string }[] | null };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status: Status = STATUSES.includes(raw as Status) ? (raw as Status) : 'pending';
  const supabase = await supabaseServer();

  const [counts, rows, links] = await Promise.all([
    Promise.all(STATUSES.map((s) => supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', s))),
    supabase
      .from('applications')
      .select('id, name, instagram, invited_by_instagram, whatsapp_e164, created_at, profile_id, vouched:vouched_by(name, member_instagram(handle))')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('link_requests')
      .select('id, application_id, profile_id, created_at, application:application_id(name), profile:profile_id(name)')
      .is('handled_at', null)
      .order('created_at'),
  ]);

  const items: RequestItem[] = ((rows.data ?? []) as unknown as { id: string; name: string; instagram: string; invited_by_instagram: string | null; whatsapp_e164: string; created_at: string; profile_id: string | null; vouched: Vouched | Vouched[] | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    instagram: r.instagram,
    invitedBy: r.invited_by_instagram,
    whatsapp: pretty(r.whatsapp_e164),
    createdAt: r.created_at,
    joined: !!r.profile_id,
    vouchedBy: one(one(r.vouched)?.member_instagram ?? null)?.handle ?? one(r.vouched)?.name.toLowerCase() ?? null,
  }));

  const linkRequests: LinkRequestItem[] = ((links.data ?? []) as unknown as { id: string; application_id: string | null; profile_id: string | null; created_at: string; application: { name: string } | { name: string }[] | null; profile: { name: string } | { name: string }[] | null }[]).map((l) => ({
    id: l.id,
    applicationId: l.application_id,
    profileId: l.profile_id,
    name: one(l.application)?.name ?? one(l.profile)?.name ?? 'someone',
    createdAt: l.created_at,
  }));

  return (
    <RequestsClient
      status={status}
      counts={{ pending: counts[0]?.count ?? 0, approved: counts[1]?.count ?? 0, rejected: counts[2]?.count ?? 0 }}
      items={items}
      linkRequests={linkRequests}
    />
  );
}
