import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanCard } from '@/components/PlanCard';
import { requireMember } from '@/lib/auth';
import { getMyPlans } from '@/lib/plans';
import styles from './chats.module.css';

export const metadata: Metadata = { title: 'chats · mesa' };

// the plan chats arrive in the next milestone; for now this lists the plans she is going to or hosts
export default async function ChatsPage() {
  const me = await requireMember();
  const plans = await getMyPlans(me.id);
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>chats</h1>
      {plans.length === 0 ? (
        <div className={styles.empty}>
          <h2>no chats yet</h2>
          <p>join a plan or host one and its chat shows up here.</p>
          <Link href="/plans" className={styles.cta}>
            see plans
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {plans.map((p) => (
              <li key={p.id}>
                <PlanCard plan={p} me={me.id} />
              </li>
            ))}
          </ul>
          <p className={styles.note}>plans you join or host show up here. their chats open soon.</p>
        </>
      )}
    </main>
  );
}
