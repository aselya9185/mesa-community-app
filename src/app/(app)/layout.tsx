import { AppNav } from '@/components/AppNav';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { ServiceWorker } from '@/components/ServiceWorker';
import { requireMember } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import styles from './shell.module.css';

// every page in here is members only: requireMember sends visitors to /login and signs removed members out
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('my_chats');
  const { count: unreadNotes } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  const unread = ((data ?? []) as { unread: number | string }[]).reduce((n, c) => n + Number(c.unread), 0);
  return (
    <NotificationsProvider userId={me.id} initialUnread={unreadNotes ?? 0}>
      <ServiceWorker />
      <div className={styles.shell}>
        <AppNav unreadChats={unread} />
        <div className={styles.content}>{children}</div>
      </div>
    </NotificationsProvider>
  );
}
