import Link from 'next/link';
import { demoMode } from '@/lib/demo';
import styles from './demo-invite.module.css';

/** on the logged-out pages of the demo: the quick way in. Renders nothing otherwise. */
export function DemoInvite({ note }: { note?: string }) {
  if (!demoMode()) return null;
  return (
    <div className={styles.box}>
      <p className={styles.text}>just looking? skip the sign-up.{note ? ` ${note}` : ''}</p>
      <Link href="/demo" className={styles.button}>
        try the demo
      </Link>
    </div>
  );
}
