import Link from 'next/link';
import { dayParts } from '@/lib/time';
import type { PlanRow } from '@/lib/plans';
import { Avatar } from './Avatar';
import styles from './plans.module.css';

export function PlanCard({ plan, me, selected }: { plan: PlanRow; me: string; selected?: boolean }) {
  const d = dayParts(plan.starts_at);
  const iAmIn = plan.going.some((g) => g.id === me);
  const isHost = plan.host_id === me;
  const shown = plan.going.slice(0, 4);
  return (
    <Link href={`/plans/${plan.id}`} className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <span className={`${styles.date} checker`}>
        <span className={styles.dow}>{d.dow}</span>
        <span className={styles.dayNum}>{d.day}</span>
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardText}>
          {plan.free_plus_one && <span className={styles.tag}>free +1</span>}
          <span className={styles.cardTitle}>{plan.title}</span>
          <span className={styles.cardMeta}>
            {d.time} · {plan.place_name}
          </span>
        </span>
        <span className={styles.cardFoot}>
          <span className={styles.avatars}>
            {shown.map((g) => (
              <Avatar key={g.id} id={g.id} name={g.name} size={32} overlap />
            ))}
          </span>
          <span className={isHost || iAmIn ? styles.footMine : styles.footMuted}>
            {isHost ? "you're hosting" : iAmIn ? "you're in" : plan.free_plus_one ? 'bring a +1' : `${plan.going.length} going`}
          </span>
        </span>
      </span>
    </Link>
  );
}
