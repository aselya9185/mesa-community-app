import type { Metadata } from 'next';
import { MembersClient, type MemberItem } from '@/components/MembersClient';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'members · mesa' };

export default async function MembersPage() {
  const me = await requireAdmin();
  const supabase = await supabaseServer();
  const { data } = await supabase.from('profiles').select('id, name, role, joined_at, is_demo, demo_key').eq('status', 'active').order('joined_at');
  const members: MemberItem[] = ((data ?? []) as { id: string; name: string; role: 'member' | 'admin'; joined_at: string; is_demo: boolean; demo_key: string | null }[]).map((m) => ({
    id: m.id,
    name: m.name,
    isAdmin: m.role === 'admin',
    isMe: m.id === me.id,
    joinedAt: m.joined_at,
    // a demo admin cannot touch real accounts or the demo cast (the database refuses it too)
    protected: me.is_demo && (!m.is_demo || !!m.demo_key),
  }));
  return <MembersClient members={members} />;
}
