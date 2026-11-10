import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ShareButton } from '@/components/ShareButton';
import { requireMember } from '@/lib/auth';
import { BookingSection, GiveButton } from '@/components/BookingSection';
import { PollSection } from '@/components/PollSection';
import { getExtras, getPlan, mapsLink } from '@/lib/plans';
import { dayParts } from '@/lib/time';
import { cancelPlanAction, joinPlanAction, leavePlanAction, removeFromPlanAction } from '../actions';
import styles from './detail.module.css';

export const metadata: Metadata = { title: 'plan · mesa' };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const plan = await getPlan(id);
  if (!plan) notFound();

  const extras = await getExtras(plan, me.id);
  const d = dayParts(plan.starts_at);
  const isHost = plan.host_id === me.id;
  const iAmIn = plan.going.some((g) => g.id === me.id);
  const host = plan.going.find((g) => g.id === plan.host_id);
  const cancelled = plan.status === 'cancelled';
  const started = new Date(plan.starts_at) <= new Date();
  const others = plan.going.filter((g) => g.id !== plan.host_id);
  const canJoin = !cancelled && !started && !iAmIn;

  return (
    <article className={styles.page}>
      <Link href="/plans" className={styles.back} aria-label="back to plans">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>

      <header className={styles.head}>
        <div className={styles.statusRow}>
          {cancelled ? (
            <span className={styles.pillCancelled}>cancelled</span>
          ) : isHost ? (
            <span className={styles.pillHost}>you&apos;re hosting</span>
          ) : iAmIn ? (
            <span className={styles.pillIn}>you&apos;re in</span>
          ) : null}
          <span className={styles.when}>
            {d.long} · {d.time}
          </span>
        </div>
        <h1 className={styles.title}>{plan.title}</h1>
        {host && (
          <p className={styles.hostLine}>
            <Avatar id={host.id} name={host.name} size={28} />
            {isHost ? 'hosted by you' : `hosted by ${host.name.split(' ')[0]!.toLowerCase()}`}
          </p>
        )}
      </header>

      {cancelled && (
        <p className={styles.banner} role="status">
          this plan was cancelled by the host.
        </p>
      )}
      {!cancelled && started && (
        <p className={styles.banner} role="status">
          this plan has already started.
        </p>
      )}

      <div className={styles.card}>
        <span className={styles.iconPink} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <div className={styles.cardText}>
          <strong>{plan.place_name}</strong>
          <a href={mapsLink(plan)} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
            open in google maps
          </a>
        </div>
      </div>

      {plan.free_plus_one && (
        <div className={styles.card}>
          <div className={styles.cardText}>
            <strong>bring a +1 available</strong>
            <span className={styles.muted}>{isHost ? 'you have a free pass for one person and you pick who gets it. anyone else can join too.' : 'the host has a free pass for one person and picks who gets it. anyone else can join too.'}</span>
          </div>
        </div>
      )}

      <BookingSection plan={plan} extras={extras} isHost={isHost} iAmIn={iAmIn} />

      <section aria-labelledby="going-h" className={styles.going}>
        <h2 id="going-h" className={styles.sectionTitle}>
          going · {plan.going.length}
        </h2>
        {isHost && others.length === 0 && !cancelled ? (
          <div className={styles.empty}>
            <strong>no one yet</strong>
            <span>nobody has joined this plan. share it in the group chat to get the first yes.</span>
          </div>
        ) : null}
        <ul className={styles.people}>
          {plan.going.map((g) => (
            <li key={g.id} className={styles.person}>
              <Avatar id={g.id} name={g.name} size={34} />
              <span className={styles.name}>
                {g.id === me.id ? `you · ${g.name.toLowerCase()}` : g.id === plan.host_id ? `${g.name.toLowerCase()} · host` : g.name.toLowerCase()}
              </span>
              {plan.booking_url && iAmIn && !cancelled && !isHost && extras.badges[g.id] === 'booked' && <span className={styles.badge}>✓ booked</span>}
              {isHost && plan.booking_url && !cancelled && (
                <span className={styles.state}>
                  {extras.hostView?.states[g.id] === 'covered' ? 'has the +1' : extras.hostView?.states[g.id] === 'booked' ? 'booked' : 'not booked'}
                </span>
              )}
              {isHost && plan.free_plus_one && plan.booking_url && !cancelled && !extras.hostView?.holder && g.id !== me.id && extras.hostView?.states[g.id] === 'not_booked' && (
                <GiveButton planId={plan.id} userId={g.id} name={g.name.toLowerCase()} />
              )}
              {isHost && g.id !== me.id && !cancelled && (
                <ConfirmDialog
                  trigger={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  }
                  triggerClassName={styles.iconBtn}
                  triggerLabel={`remove ${g.name.toLowerCase()} from the plan`}
                  title={`remove ${g.name.split(' ')[0]!.toLowerCase()}?`}
                  body="she loses her spot and access to the plan chat. if she had the free +1, you can give it to someone else."
                  confirmLabel="remove from plan"
                  cancelLabel="keep her"
                  onConfirm={removeFromPlanAction.bind(null, plan.id, g.id)}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <PollSection planId={plan.id} options={extras.poll} iAmIn={iAmIn} canAdd={extras.canAddOption} cancelled={cancelled} />

      <div className={styles.actions}>
        {canJoin && (
          <form action={joinPlanAction.bind(null, plan.id)}>
            <button type="submit" className={styles.join}>
              count me in
            </button>
          </form>
        )}
        {isHost && !cancelled && (
          <div className={styles.hostTools}>
            <Link href={`/plans/${plan.id}/edit`} className={styles.btnGhost}>
              edit plan
            </Link>
            <ShareButton path={`/plans/${plan.id}`} title={plan.title} />
            <ConfirmDialog
              trigger="cancel plan"
              triggerClassName={styles.btnQuiet}
              title="cancel this plan?"
              body="everyone in it gets told in the chat."
              confirmLabel="cancel plan"
              cancelLabel="keep it"
              onConfirm={cancelPlanAction.bind(null, plan.id)}
            />
          </div>
        )}
        {iAmIn && !isHost && !cancelled && !started && (
          <ConfirmDialog
            trigger="can't make it? leave this plan"
            triggerClassName={styles.leave}
            title="leave this plan?"
            body="you lose your spot and the chat. you can join again later."
            confirmLabel="leave plan"
            cancelLabel="stay in"
            onConfirm={leavePlanAction.bind(null, plan.id)}
          />
        )}
        {!isHost && !cancelled && (
          <div className={styles.hostTools}>
            <ShareButton path={`/plans/${plan.id}`} title={plan.title} label="share plan" />
          </div>
        )}
      </div>
    </article>
  );
}
