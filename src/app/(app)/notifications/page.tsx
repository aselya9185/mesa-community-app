import type { Metadata } from 'next';
import { EnablePush } from '@/components/EnablePush';
import { NotificationList } from '@/components/NotificationList';
import { requireMember } from '@/lib/auth';
import type { NotificationRow } from '@/lib/notification-text';
import { supabaseServer } from '@/lib/supabase/server';
import styles from './notifications.module.css';

export const metadata: Metadata = { title: 'notifications · mesa' };

export default async function NotificationsPage() {
  await requireMember();
  const supabase = await supabaseServer();
  const { data } = await supabase.from('notifications').select('id, user_id, type, plan_id, data, read_at, created_at').order('created_at', { ascending: false }).limit(50);
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>notifications</h1>
      <EnablePush publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
      <NotificationList initial={(data ?? []) as NotificationRow[]} />
    </main>
  );
}
