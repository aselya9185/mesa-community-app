import type { Metadata } from 'next';
import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { dayParts } from '@/lib/time';
import styles from './chats.module.css';

export const metadata: Metadata = { title: 'chats · mesa' };

type Chat = { plan_id: string; title: string; starts_at: string; status: string; last_body: string | null; last_kind: string | null; last_sender: string | null; last_at: string | null; unread: number | string };

export default async function ChatsPage() {
  await requireMember();
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('my_chats');
  const chats = (data ?? []) as Chat[];
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>chats</h1>
      {chats.length === 0 ? (
        <div className={styles.empty}>
          <h2>no chats yet</h2>
          <p>join a plan or host one and its chat shows up here.</p>
          <Link href="/plans" className={styles.cta}>
            see plans
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {chats.map((c) => {
              const d = dayParts(c.starts_at);
              const unread = Number(c.unread);
              const preview = c.last_body ? (c.last_kind === 'user' && c.last_sender ? `${c.last_sender}: ${c.last_body}` : c.last_body) : 'no messages yet';
              return (
                <li key={c.plan_id}>
                  <Link href={`/plans/${c.plan_id}?tab=chat`} className={styles.row}>
                    <span className={`${styles.date} checker`}>
                      <span className={styles.dow}>{d.dow}</span>
                      <span className={styles.day}>{d.day}</span>
                    </span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTop}>
                        <span className={styles.rowTitle}>{c.title}</span>
                        {unread > 0 && (
                          <span className={styles.badge} aria-label={`${unread} unread`}>
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </span>
                      <span className={styles.preview}>{preview}</span>
                      {c.status === 'cancelled' && <span className={styles.cancelled}>cancelled</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className={styles.note}>plans you join or host show up here</p>
        </>
      )}
    </main>
  );
}
