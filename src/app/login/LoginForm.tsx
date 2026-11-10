'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import styles from '@/components/auth.module.css';
import { loginAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  return (
    <form action={action} className={styles.form}>
      <h1 className={styles.title}>welcome back</h1>
      <div className={styles.field}>
        <label htmlFor="whatsapp" className={styles.label}>
          whatsapp number
        </label>
        <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="username" className={styles.input} placeholder="+34" defaultValue={state?.whatsapp ?? ''} required />
      </div>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" className={styles.input} required />
      </div>
      <Link href="/apply?from=forgot" className={styles.link}>
        forgot it? ask the club for a new link
      </Link>
      {state?.error === 'wrong' && (
        <p role="alert" className={styles.alert}>
          that number and password don&apos;t match. try again or ask the club for a new link.
        </p>
      )}
      {state?.error === 'rate_limited' && (
        <p role="alert" className={styles.alert}>
          too many tries. wait a few minutes and try again.
        </p>
      )}
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'checking…' : 'log in'}
      </button>
      <p className={styles.footnote}>
        not in yet?{' '}
        <Link href="/apply" className={styles.link}>
          request an invite
        </Link>
      </p>
    </form>
  );
}
