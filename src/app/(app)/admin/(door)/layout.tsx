import { AdminTabs } from '@/components/AdminTabs';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';
import styles from './door.module.css';

export default async function DoorLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('admin_counts');
  const c = (data ?? { requests: 0, link_requests: 0, reports: 0 }) as { requests: number; link_requests: number; reports: number };
  return (
    <main className={styles.page}>
      <p className={styles.lock}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="3" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
        door list · only you
      </p>
      <h1 className={styles.title}>who&apos;s at the door</h1>
      <AdminTabs requests={Number(c.requests) + Number(c.link_requests)} reports={Number(c.reports)} />
      {children}
    </main>
  );
}
