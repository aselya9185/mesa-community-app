'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin-tabs.module.css';

const TABS = [
  { href: '/admin/requests', label: 'requests' },
  { href: '/admin/members', label: 'members' },
  { href: '/admin/reports', label: 'reports' },
];

export function AdminTabs({ requests, reports }: { requests: number; reports: number }) {
  const path = usePathname();
  const counts: Record<string, number> = { requests, reports };
  return (
    <nav className={styles.tabs} aria-label="door list sections">
      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        const n = counts[t.label] ?? 0;
        return (
          <Link key={t.href} href={t.href} className={`${styles.tab} ${on ? styles.on : ''}`} aria-current={on ? 'page' : undefined}>
            {t.label}
            {n > 0 && <span className={styles.count}>{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
