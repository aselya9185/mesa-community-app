import type { Metadata } from 'next';
import { ReportsClient, type ReportItem } from '@/components/ReportsClient';
import { supabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'reports · mesa' };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function ReportsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('reports')
    .select('id, reason, note, created_at, reporter:reporter_id(name), reported:reported_id(id, name, status, role), plan:plan_id(title)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100);
  type Raw = {
    id: string; reason: string; note: string | null; created_at: string;
    reporter: { name: string } | { name: string }[] | null;
    reported: { id: string; name: string; status: string; role: string } | { id: string; name: string; status: string; role: string }[] | null;
    plan: { title: string } | { title: string }[] | null;
  };
  const items: ReportItem[] = ((data ?? []) as unknown as Raw[]).map((r) => {
    const reported = one(r.reported);
    return {
      id: r.id,
      reason: r.reason,
      note: r.note,
      createdAt: r.created_at,
      reporter: one(r.reporter)?.name ?? 'someone',
      reportedId: reported?.id ?? '',
      reported: reported?.name ?? 'someone',
      canRemove: !!reported && reported.status === 'active' && reported.role !== 'admin',
      plan: one(r.plan)?.title ?? null,
    };
  });
  return <ReportsClient items={items} />;
}
