import type { Metadata } from 'next';
import { logoutAction } from '@/app/login/actions';
import styles from '@/components/auth.module.css';
import { requireMember } from '@/lib/auth';

export const metadata: Metadata = { title: 'plans · mesa' };

// placeholder: the real "this week" feed arrives with the plans milestone
export default async function PlansPage() {
  const me = await requireMember();
  return (
    <main className={styles.content} style={{ minHeight: '100dvh', justifyContent: 'center' }}>
      <span className={styles.kicker}>closed club · bcn · no. {String(me.member_no).padStart(3, '0')}</span>
      <h1 className={styles.title}>hi {me.name.toLowerCase()}</h1>
      <p className={styles.sub}>you&apos;re in. plans land here soon.</p>
      <form action={logoutAction}>
        <button type="submit" className={styles.link} style={{ background: 'none', border: 0, cursor: 'pointer' }}>
          log out
        </button>
      </form>
    </main>
  );
}
