'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from './NotificationBell';
import { PlanCard } from './PlanCard';
import type { PlanRow } from '@/lib/plans';
import styles from './plans-list.module.css';

export function PlansList({ plans, me }: { plans: PlanRow[]; me: string }) {
  const path = usePathname();
  const onList = path === '/plans';
  const selectedId = path.startsWith('/plans/') ? path.split('/')[2] : undefined;
  return (
    <aside className={`${styles.list} ${onList ? '' : styles.hideOnPhone}`} aria-label="plans this week">
      <header className={styles.head}>
        <div>
          <p className={styles.city}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            barcelona
          </p>
          <h1 className={styles.title}>this week</h1>
        </div>
        <div className={styles.actions}>
          <NotificationBell className={styles.bellMobile} />
        <Link href="/plans/new" className={styles.drop}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          drop
        </Link>
        </div>
      </header>

      {plans.length === 0 ? (
        <div className={styles.empty}>
          <h2>nothing on yet</h2>
          <p>no plans this week. be the first girl to drop one: a class, a run, a matcha.</p>
          <Link href="/plans/new" className={styles.emptyCta}>
            drop a plan
          </Link>
        </div>
      ) : (
        <ul className={styles.cards}>
          {plans.map((p) => (
            <li key={p.id}>
              <PlanCard plan={p} me={me} selected={p.id === selectedId} />
            </li>
          ))}
        </ul>
      )}
      {plans.length > 0 && <p className={styles.note}>new plans land here when members drop them</p>}
    </aside>
  );
}
