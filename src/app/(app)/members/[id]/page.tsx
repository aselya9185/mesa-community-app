import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MemberCard, type CardMember } from '@/components/MemberCard';
import { ReportDialog } from '@/components/ReportDialog';
import { requireMember } from '@/lib/auth';
import { signAvatar } from '@/lib/photos';
import { supabaseServer } from '@/lib/supabase/server';
import { blockAction, unblockAction } from '../actions';
import styles from './member.module.css';

export const metadata: Metadata = { title: 'member · mesa' };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { id } = await params;
  const { plan } = await searchParams;
  const me = await requireMember();
  if (id === me.id) redirect('/card');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await supabaseServer();
  const { data } = await supabase.from('profiles').select('id, name, instagram, area, bio, likes, trains_at, member_no, photo_path').eq('id', id).maybeSingle();
  if (!data) notFound();
  const { data: block } = await supabase.from('blocks').select('blocked_id').eq('blocked_id', id).maybeSingle();
  const blocked = !!block;
  const m = { ...(data as CardMember & { photo_path: string | null }), photo: await signAvatar((data as { photo_path: string | null }).photo_path) } as CardMember;
  const first = m.name.split(' ')[0]!.toLowerCase();
  const planId = plan && /^[0-9a-f-]{36}$/i.test(plan) ? plan : null;

  return (
    <main className={styles.page}>
      <Link href={planId ? `/plans/${planId}` : '/plans'} className={styles.back} aria-label="back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>
      <MemberCard m={m} />
      {blocked && <p className={styles.note}>you blocked {first}. you won&apos;t see her messages or get pings about her.</p>}
      <div className={styles.actions}>
        <ReportDialog userId={m.id} name={m.name} planId={planId} triggerClassName={styles.ghost} />
        {blocked ? (
          <form action={unblockAction.bind(null, m.id)}>
            <button type="submit" className={styles.ghost}>
              unblock {first}
            </button>
          </form>
        ) : (
          <ConfirmDialog
            trigger={`block ${first}`}
            triggerClassName={styles.ghost}
            title={`block ${first}?`}
            body="you won't see her messages or get pings about her. she isn't told. you can unblock her any time from your card."
            confirmLabel="block her"
            cancelLabel="never mind"
            onConfirm={blockAction.bind(null, m.id)}
          />
        )}
      </div>
    </main>
  );
}
