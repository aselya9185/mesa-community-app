import { AppNav } from '@/components/AppNav';
import { requireMember } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import styles from './shell.module.css';

// every page in here is members only: requireMember sends visitors to /login and signs removed members out
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('my_chats');
  const unread = ((data ?? []) as { unread: number | string }[]).reduce((n, c) => n + Number(c.unread), 0);
  return (
    <div className={styles.shell}>
      <AppNav unreadChats={unread} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
