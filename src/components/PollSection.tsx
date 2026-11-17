import { clearVoteAction, voteAction } from '@/app/(app)/plans/actions';
import type { PollOption } from '@/lib/plans';
import { AddOption } from './AddOption';
import styles from './poll.module.css';

export function PollSection({ planId, options, iAmIn, canAdd, cancelled }: { planId: string; options: PollOption[]; iAmIn: boolean; canAdd: boolean; cancelled: boolean }) {
  if (options.length === 0) {
    // nobody has suggested anything yet: people who are going still see the section, so the first idea can come from anyone
    if (!canAdd || cancelled) return null;
    return (
      <section aria-labelledby="poll-h" className={styles.poll}>
        <div className={styles.head}>
          <h2 id="poll-h" className={styles.title}>
            plans after
          </h2>
          <span className={styles.hint}>no ideas yet</span>
        </div>
        <p className={styles.hint}>fancy something after? add an idea and the others can vote.</p>
        <AddOption planId={planId} />
      </section>
    );
  }
  const total = options.reduce((n, o) => n + o.votes, 0);
  return (
    <section aria-labelledby="poll-h" className={styles.poll}>
      <div className={styles.head}>
        <h2 id="poll-h" className={styles.title}>
          plans after
        </h2>
        <span className={styles.hint}>{iAmIn && !cancelled ? 'pick one. change it any time.' : 'vote once you are in'}</span>
      </div>
      <ul className={styles.grid}>
        {options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const inner = (
            <>
              <span className={styles.bar} style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className={styles.label}>{o.label}</span>
              <span className={styles.count}>{iAmIn ? o.votes : ''}</span>
            </>
          );
          return (
            <li key={o.id}>
              {iAmIn && !cancelled ? (
                <form action={o.mine ? clearVoteAction.bind(null, planId) : voteAction.bind(null, planId, o.id)}>
                  <button type="submit" className={`${styles.option} ${o.mine ? styles.mine : ''}`} aria-pressed={o.mine}>
                    {inner}
                  </button>
                </form>
              ) : (
                <span className={`${styles.option} ${styles.locked}`}>{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
      {canAdd && <AddOption planId={planId} />}
    </section>
  );
}
