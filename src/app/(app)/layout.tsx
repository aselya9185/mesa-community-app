import { Suspense } from 'react';
import { AppNav } from '@/components/AppNav';
import { DemoBar } from '@/components/DemoBar';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { ServiceWorker } from '@/components/ServiceWorker';
import { requireMember } from '@/lib/auth';
import { demoMode } from '@/lib/demo';
import { supabaseServer } from '@/lib/supabase/server';
import styles from './shell.module.css';

// every page in here is members only: requireMember sends visitors to /login and signs removed members out
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const supabase = await supabaseServer();
  // independent questions: ask them together (each one is a trip to the database)
  const [{ data }, { data: counts }, { count: unreadNotes }] = await Promise.all([
    supabase.rpc('my_chats'),
    me.role === 'admin' ? supabase.rpc('admin_counts') : Promise.resolve({ data: null }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);
  const door = counts ? Number((counts as { requests: number }).requests) + Number((counts as { link_requests: number }).link_requests) + Number((counts as { reports: number }).reports) : 0;
  const unread = ((data ?? []) as { unread: number | string }[]).reduce((n, c) => n + Number(c.unread), 0);
  return (
    <NotificationsProvider userId={me.id} initialUnread={unreadNotes ?? 0}>
      <ServiceWorker />
      <a href="#content" className={styles.skip}>
        skip to content
      </a>
      <div className={`${styles.shell} ${demoMode() ? styles.demo : ''}`}>
        <AppNav unreadChats={unread} isAdmin={me.role === 'admin'} doorCount={door} />
        <div id="content" tabIndex={-1} className={styles.content}>
          {demoMode() && (
            <Suspense>
              <DemoBar current={me.demo_key} />
            </Suspense>
          )}
          {children}
        </div>
      </div>
    </NotificationsProvider>
  );
}
