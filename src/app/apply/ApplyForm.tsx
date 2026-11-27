'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { CheckBadge } from '@/components/AuthShell';
import styles from '@/components/auth.module.css';
import { applyAction, type ApplyFormState } from './actions';

export function ApplyForm({ vouchCode, fromForgot }: { vouchCode?: string; fromForgot?: boolean }) {
  const [state, action, pending] = useActionState<ApplyFormState, FormData>(applyAction, null);
  const s = state?.state;

  if (s === 'listed') {
    return (
      <Done title="you're on the list" body="we'll send you a personal link on whatsapp. tap it to make your password." />
    );
  }
  if (s === 'link_requested') {
    return <Done title="got it" body="the club will send you a fresh link on whatsapp soon. no need to ask again." />;
  }
  if (s === 'pending') {
    return <Done title="still on the list" body="your request is being reviewed. we reply on whatsapp within 24h." />;
  }
  if (s === 'approved' && state) {
    return (
      <>
        <CheckBadge />
        <h1 className={styles.title}>you&apos;re approved</h1>
        <p className={styles.sub}>your request has already been approved. haven&apos;t received your invite link?</p>
        <RequestLink values={state.values} pending={pending} action={action} label="re-request link" />
        <Link href="/login" className={styles.link}>
          already in? log in
        </Link>
      </>
    );
  }
  if (s === 'member' && state) {
    return (
      <>
        <CheckBadge />
        <h1 className={styles.title}>you&apos;re already in</h1>
        <p className={styles.sub}>looks like you already have an account. log in with your number and password.</p>
        <Link href="/login" className={styles.primary}>
          log in
        </Link>
        <p className={styles.sub}>forgot your password?</p>
        <RequestLink values={state.values} pending={pending} action={action} label="ask the club for a new link" />
      </>
    );
  }

  const errors = state?.state === 'invalid' ? state.errors : undefined;
  return (
    <form action={action} className={styles.form} noValidate>
      <p className={styles.sub} style={{ color: 'var(--muted)' }}>
        <span className={styles.kicker}>closed club · bcn</span>
      </p>
      <h1 className={styles.title}>request an invite</h1>
      <p className={styles.sub}>
        {fromForgot
          ? "forgot your password? fill this in. if you're already in, we'll ask the club to send you a fresh link."
          : 'a closed girls club in barcelona. we read every request by hand.'}
      </p>

      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          your name
        </label>
        <input id="name" name="name" defaultValue={state?.values.name} className={styles.input} autoComplete="given-name" maxLength={60} aria-invalid={!!errors?.name} aria-describedby={errors?.name ? 'name-err' : undefined} />
        {errors?.name && <span id="name-err" className={styles.error}>{errors.name}</span>}
      </div>
      <div className={styles.field}>
        <label htmlFor="instagram" className={styles.label}>
          your instagram
        </label>
        <input id="instagram" name="instagram" defaultValue={state?.values.instagram} className={styles.input} placeholder="@" autoCapitalize="none" autoCorrect="off" maxLength={31} aria-invalid={!!errors?.instagram} aria-describedby={errors?.instagram ? 'ig-err' : undefined} />
        {errors?.instagram ? <span id="ig-err" className={styles.error}>{errors.instagram}</span> : <span className={styles.hint}>only the club admin sees this, to check your request. it is never shown to members unless you choose to.</span>}
      </div>
      <div className={styles.field}>
        <label htmlFor="whatsapp" className={styles.label}>
          whatsapp number
        </label>
        <input id="whatsapp" name="whatsapp" defaultValue={state?.values.whatsapp} type="tel" inputMode="tel" autoComplete="tel" className={styles.input} placeholder="+34" aria-invalid={!!errors?.whatsapp} aria-describedby="wa-hint" />
        <span id="wa-hint" className={errors?.whatsapp ? styles.error : styles.hint}>
          {errors?.whatsapp ?? 'we check it against the club whatsapp group'}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor="invitedBy" className={styles.label}>
          invited by a member? <span className={styles.optional}>(optional)</span>
        </label>
        <input id="invitedBy" name="invitedBy" defaultValue={state?.values.invitedBy} className={styles.input} placeholder="her instagram" autoCapitalize="none" autoCorrect="off" maxLength={31} aria-invalid={!!errors?.invitedBy} aria-describedby="invited-hint" />
        <span id="invited-hint" className={errors?.invitedBy ? styles.error : styles.hint}>{errors?.invitedBy ?? 'a vouch gets you in faster'}</span>
      </div>

      {/* bots fill every field they see; people never see this one */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="website">website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {vouchCode && <input type="hidden" name="vouchCode" value={vouchCode} />}

      {s === 'rate_limited' && (
        <p role="alert" className={styles.alert}>
          easy there. too many tries from here. wait a bit and try again.
        </p>
      )}
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'sending…' : 'request invite'}
      </button>
      <p className={styles.footnote}>we reply on whatsapp within 24h</p>
      <p className={styles.footnote}>
        <Link href="/login" className={styles.link}>
          already in? log in
        </Link>
      </p>
    </form>
  );
}

function Done({ title, body }: { title: string; body: string }) {
  return (
    <>
      <CheckBadge />
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.sub} role="status">
        {body}
      </p>
      <Link href="/login" className={styles.link}>
        already in? log in
      </Link>
    </>
  );
}

function RequestLink({
  values,
  pending,
  action,
  label,
}: {
  values: { instagram: string; whatsapp: string; name: string };
  pending: boolean;
  action: (formData: FormData) => void;
  label: string;
}) {
  // she already typed everything: we send it again, she types nothing
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="intent" value="request_link" />
      <input type="hidden" name="name" value={values.name} />
      <input type="hidden" name="instagram" value={values.instagram} />
      <input type="hidden" name="whatsapp" value={values.whatsapp} />
      <button type="submit" className={styles.secondary} disabled={pending}>
        {pending ? 'asking…' : label}
      </button>
    </form>
  );
}
