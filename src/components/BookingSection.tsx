import { assignPlusOneAction, revokePlusOneAction, setBookingAction } from '@/app/(app)/plans/actions';
import type { PlanExtras, PlanRow } from '@/lib/plans';
import styles from './booking.module.css';

function hostName(plan: PlanRow): string {
  return (plan.going.find((g) => g.id === plan.host_id)?.name ?? 'the host').split(' ')[0]!.toLowerCase();
}

export function BookingSection({ plan, extras, isHost, iAmIn }: { plan: PlanRow; extras: PlanExtras; isHost: boolean; iAmIn: boolean }) {
  if (!iAmIn || plan.status !== 'active') return null;

  // a plan with no booking link: nothing to track
  if (!plan.booking_url) {
    return (
      <div className={styles.card}>
        <div className={styles.text}>
          <strong>no booking needed</strong>
          <span className={styles.muted}>just show up.</span>
        </div>
      </div>
    );
  }

  const state = extras.myState ?? 'not_booked';
  const booked = state === 'booked' || state === 'covered';

  if (isHost) {
    const holder = extras.hostView?.holder ? plan.going.find((g) => g.id === extras.hostView!.holder) : null;
    return (
      <>
        <div className={styles.card}>
          <div className={styles.text}>
            <strong>i booked</strong>
            <span className={styles.muted}>your own spot on the booking page</span>
          </div>
          <form action={setBookingAction.bind(null, plan.id, !booked)}>
            <button type="submit" role="switch" aria-checked={booked} aria-label="i booked" className={`${styles.switch} ${booked ? styles.switchOn : ''}`}>
              <span />
            </button>
          </form>
        </div>
        {plan.free_plus_one && (
          <div className={`${styles.card} ${styles.plus}`}>
            <div className={styles.text}>
              <strong className={styles.pink}>{holder ? 'free +1 · given' : 'free +1 · not given yet'}</strong>
              <span className={styles.muted}>
                {holder
                  ? `${holder.name.toLowerCase()} has it. only you see this.`
                  : "only you see this. give it to a girl who hasn't booked below. nobody else sees who got it."}
              </span>
            </div>
            {holder && (
              <form action={revokePlusOneAction.bind(null, plan.id)}>
                <button type="submit" className={styles.ghost}>
                  take it back
                </button>
              </form>
            )}
          </div>
        )}
      </>
    );
  }

  const chip = extras.plusOne === 'pending' ? '+1 pending' : extras.plusOne === 'yours' ? 'you got the +1' : extras.plusOne === 'taken' ? '+1 is taken' : null;
  const note =
    extras.plusOne === 'pending'
      ? `${hostName(plan)} picks who gets the free +1.`
      : extras.plusOne === 'yours'
        ? `${hostName(plan)}'s free pass covers you. ask in the chat how to use it.`
        : extras.plusOne === 'taken'
          ? 'the free +1 has gone to someone else.'
          : 'this plan takes bookings on its own page.';
  return (
    <div className={styles.card}>
      <div className={styles.stack}>
        <div className={styles.row}>
          <strong>book your spot</strong>
          {chip && <span className={`${styles.chip} ${extras.plusOne === 'yours' ? styles.chipOn : ''}`}>{chip}</span>}
        </div>
        <span className={styles.muted}>{note}</span>
        <div className={styles.buttons}>
          <a href={plan.booking_url} target="_blank" rel="noopener noreferrer" className={styles.primary}>
            book your spot
          </a>
          {state === 'covered' ? (
            <span className={styles.covered}>booked · covered</span>
          ) : (
            <form action={setBookingAction.bind(null, plan.id, !booked)}>
              <button type="submit" className={`${styles.outline} ${booked ? styles.outlineOn : ''}`} aria-pressed={booked}>
                {booked ? '✓ booked' : 'mark as booked'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function GiveButton({ planId, userId, name }: { planId: string; userId: string; name: string }) {
  return (
    <form action={assignPlusOneAction.bind(null, planId, userId)}>
      <button type="submit" className={styles.give} aria-label={`give the +1 to ${name}`}>
        give +1
      </button>
    </form>
  );
}
