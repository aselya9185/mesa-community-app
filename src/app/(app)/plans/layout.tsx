import { PlansList } from '@/components/PlansList';
import { requireMember } from '@/lib/auth';
import { getFeedFor } from '@/lib/plans';
import styles from './plans-layout.module.css';

// phone: the list OR a plan, one at a time. tablet/desktop: the list stays on the left.
export default async function PlansLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const plans = await getFeedFor(me.id);
  return (
    <div className={styles.split}>
      <PlansList plans={plans} me={me.id} />
      <section className={styles.pane}>{children}</section>
    </div>
  );
}
