'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { notificationText, type NotificationRow } from '@/lib/notification-text';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { useNotifications } from './NotificationsProvider';
import styles from './notification-list.module.css';

const ICONS: Record<string, string> = {
  plan: 'M12 5v14M5 12h14',
  person: 'M16 11a4 4 0 10-8 0M4 20c0-3 3-5 6-5',
  gift: 'M5 12.5l4.5 4.5L19 7.5',
  chat: 'M4 5h16v11H9l-5 4z',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  cancel: 'M6 6l12 12M18 6L6 18',
};

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const { refresh } = useNotifications();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read_at).length;

  async function open(n: NotificationRow, url: string) {
    if (!n.read_at) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await supabaseBrowser().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
      refresh();
    }
    router.push(url);
  }

  async function markAll() {
    const now = new Date().toISOString();
    setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at ?? now })));
    await supabaseBrowser().from('notifications').update({ read_at: now }).is('read_at', null);
    refresh();
  }

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.count}>{unread > 0 ? `${unread} new` : 'all caught up'}</span>
        <button type="button" className={styles.markAll} onClick={markAll} disabled={unread === 0}>
          mark all read
        </button>
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>
          <h2>nothing yet</h2>
          <p>new plans, the +1 and messages show up here.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((n) => {
            const t = notificationText(n);
            return (
              <li key={n.id}>
                <button type="button" className={styles.item} onClick={() => open(n, t.url)}>
                  <span className={styles.icon} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICONS[t.icon]} />
                    </svg>
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{t.body}</span>
                    <span className={styles.when}>{ago(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className={styles.dot} role="img" aria-label="unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
