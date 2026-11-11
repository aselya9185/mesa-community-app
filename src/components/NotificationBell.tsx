'use client';

import Link from 'next/link';
import { useNotifications } from './NotificationsProvider';
import styles from './bell.module.css';

export function NotificationBell({ className = '' }: { className?: string }) {
  const { unread } = useNotifications();
  return (
    <Link href="/notifications" className={`${styles.bell} ${className}`} aria-label={unread > 0 ? `notifications, ${unread} unread` : 'notifications'}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0" />
      </svg>
      {unread > 0 && <span className={styles.count}>{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
