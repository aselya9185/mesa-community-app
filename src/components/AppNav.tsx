'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from './NotificationBell';
import styles from './nav.module.css';

const ITEMS = [
  { href: '/plans', label: 'plans', d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { href: '/chats', label: 'chats', d: 'M4 5h16v11H9l-5 4z' },
  { href: '/plans/new', label: 'drop', d: 'M12 5v14M5 12h14' },
  { href: '/card', label: 'card', d: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
];

function isActive(path: string, href: string): boolean {
  if (href === '/plans/new') return path.startsWith('/plans/new');
  if (href === '/plans') return path.startsWith('/plans') && !path.startsWith('/plans/new');
  return path === href || path.startsWith(href + '/');
}

/** mobile: floating pill bar at the bottom. tablet/desktop: vertical rail on the left. */
export function AppNav({ unreadChats = 0 }: { unreadChats?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="main" className={styles.nav}>
      <span className={styles.brand}>mesa</span>
      <ul className={styles.list}>
        {ITEMS.map((i) => {
          const active = isActive(path, i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-label={i.label} className={`${styles.item} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={i.d} />
                </svg>
                <span>{i.label}</span>
                {i.href === '/chats' && unreadChats > 0 && (
                  <span className={styles.dot} aria-label={`${unreadChats} unread`}>
                    {unreadChats > 9 ? '9+' : unreadChats}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <NotificationBell className={styles.railBell} />
    </nav>
  );
}
