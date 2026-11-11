'use client';

import { useActionState, useRef } from 'react';
import { reportAction, type ReportState } from '@/app/(app)/members/actions';
import styles from './report.module.css';

const REASONS: { value: string; label: string }[] = [
  { value: 'uncomfortable', label: 'made me feel uncomfortable' },
  { value: 'spam_or_fake', label: 'spam or a fake profile' },
  { value: 'no_show', label: "didn't show up" },
  { value: 'other', label: 'something else' },
];

/** a native <dialog>: focus is trapped, Esc closes it */
export function ReportDialog({ userId, name, planId = null, triggerClassName }: { userId: string; name: string; planId?: string | null; triggerClassName?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ReportState, FormData>(reportAction.bind(null, userId, planId), null);
  const first = name.split(' ')[0]!.toLowerCase();
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        report
      </button>
      <dialog ref={ref} className={styles.dialog} aria-labelledby={`report-${userId}`}>
        {state?.status === 'done' ? (
          <>
            <h2 id={`report-${userId}`} className={styles.title}>
              thanks
            </h2>
            <p className={styles.body} role="status">
              thanks. the door list will take a look. {first} won&apos;t be told.
            </p>
            <button type="button" className={styles.confirm} onClick={() => ref.current?.close()}>
              close
            </button>
          </>
        ) : (
          <form action={action} className={styles.form}>
            <h2 id={`report-${userId}`} className={styles.title}>
              report {first}?
            </h2>
            <p className={styles.body}>only the door list sees this. she won&apos;t be told.</p>
            <fieldset className={styles.reasons}>
              <legend className="sr-only">what happened</legend>
              {REASONS.map((r) => (
                <label key={r.value} className={styles.reason}>
                  <input type="radio" name="reason" value={r.value} required />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label htmlFor={`note-${userId}`} className={styles.noteLabel}>
              anything else? <span className={styles.optional}>(optional)</span>
            </label>
            <input id={`note-${userId}`} name="note" maxLength={300} className={styles.note} placeholder="a line is plenty" />
            <label className={styles.check}>
              <input type="checkbox" name="block" defaultChecked />
              also block her: hide her messages and mute her pings
            </label>
            {state?.status === 'error' && (
              <p role="alert" className={styles.error}>
                {state.message}
              </p>
            )}
            <button type="submit" className={styles.confirm} disabled={pending}>
              {pending ? 'sending…' : 'send report'}
            </button>
            <button type="button" className={styles.cancel} onClick={() => ref.current?.close()}>
              never mind
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
