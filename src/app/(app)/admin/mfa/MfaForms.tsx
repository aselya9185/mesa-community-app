'use client';

import { useActionState, useState } from 'react';
import authStyles from '@/components/auth.module.css';
import { startEnrollAction, verifyMfaAction, type EnrollResult, type VerifyState } from './actions';
import styles from './mfa.module.css';

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyMfaAction.bind(null, factorId), null);
  return (
    <form action={action} className={authStyles.form}>
      <div className={authStyles.field}>
        <label htmlFor="code" className={authStyles.label}>
          6-digit code
        </label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} className={authStyles.input} aria-invalid={!!state?.error} required />
        <span className={authStyles.hint}>from your authenticator app. it changes every 30 seconds.</span>
      </div>
      {state?.error && (
        <p role="alert" className={authStyles.alert}>
          {state.error}
        </p>
      )}
      <button type="submit" className={authStyles.primary} disabled={pending}>
        {pending ? 'checking…' : 'open the door'}
      </button>
    </form>
  );
}

/** first time: scan once. every time after: only the code. */
export function MfaSetup() {
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [busy, setBusy] = useState(false);
  return enroll?.ok ? (
    <div className={styles.setup}>
      <ol className={styles.steps}>
        <li>open an authenticator app (google authenticator, 1password, authy…)</li>
        <li>scan this code, or type the secret in by hand</li>
        <li>type the 6-digit code it shows</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qr} alt="qr code for your authenticator app" className={styles.qr} width={200} height={200} />
      <p className={styles.secret}>
        <span className={authStyles.hint}>secret</span> <code>{enroll.secret}</code>
      </p>
      <CodeForm factorId={enroll.factorId} />
    </div>
  ) : (
    <div className={styles.setup}>
      <p className={authStyles.sub}>the door list holds everyone&apos;s numbers, so it asks for a second step. you scan a code once, then you only type a 6-digit code.</p>
      {enroll && !enroll.ok && (
        <p role="alert" className={authStyles.alert}>
          {enroll.error}
        </p>
      )}
      <button
        type="button"
        className={authStyles.primary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setEnroll(await startEnrollAction());
          setBusy(false);
        }}
      >
        {busy ? 'one moment…' : 'set up two-step sign-in'}
      </button>
    </div>
  );
}

export function MfaChallenge({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} />;
}
