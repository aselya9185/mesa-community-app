'use client';

import { useActionState, useState } from 'react';
import styles from '@/components/auth.module.css';
import { joinAction, type JoinState } from './actions';

const MESSAGES: Record<NonNullable<JoinState>['error'], string> = {
  weak_password: 'your password needs at least 8 characters.',
  invalid_link: 'this link has already been used or has expired. ask the club for a new one.',
  rate_limited: 'too many tries. wait a bit and try again.',
  failed: "something went wrong and your link is still safe. try again, or ask the club for a new one.",
};

export function JoinForm({ token, firstName, purpose }: { token: string; firstName: string; purpose: 'invite' | 'reset' }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinAction.bind(null, token), null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className={styles.form}>
      <h1 className={styles.title}>{purpose === 'invite' ? `you're in, ${firstName}` : `new password, ${firstName}`}</h1>
      <p className={styles.sub}>{purpose === 'invite' ? 'pick a password and the door opens.' : 'pick a new password and you are back in.'}</p>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          password
        </label>
        <div className={styles.pwWrap}>
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            className={styles.input}
            minLength={8}
            maxLength={72}
            required
            aria-describedby="pw-hint"
          />
          <button type="button" className={styles.pwToggle} onClick={() => setShow((v) => !v)} aria-label={show ? 'hide password' : 'show password'} aria-pressed={show}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <span id="pw-hint" className={styles.hint}>
          use one you don&apos;t use anywhere else · at least 8 characters
        </span>
      </div>
      {state && (
        <p role="alert" className={styles.alert}>
          {MESSAGES[state.error]}
        </p>
      )}
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'opening the door…' : 'let me in'}
      </button>
      <p className={styles.hint}>this link works once. the club is private: only approved girls see plans, chats and profiles.</p>
    </form>
  );
}
