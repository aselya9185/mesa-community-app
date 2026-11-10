'use client';

import { useActionState } from 'react';
import { addOptionAction, type AddOptionState } from '@/app/(app)/plans/actions';
import styles from './poll.module.css';

export function AddOption({ planId }: { planId: string }) {
  const [state, action, pending] = useActionState<AddOptionState, FormData>(addOptionAction.bind(null, planId), null);
  return (
    <form action={action} className={styles.add}>
      <label htmlFor="opt" className={styles.addLabel}>
        add your own
      </label>
      <div className={styles.addRow}>
        <input id="opt" name="label" defaultValue={state?.value ?? ''} maxLength={30} className={styles.addInput} placeholder="sunset walk" aria-invalid={!!state?.error} aria-describedby={state?.error ? 'opt-err' : undefined} />
        <button type="submit" className={styles.addBtn} disabled={pending}>
          add
        </button>
      </div>
      {state?.error && (
        <p id="opt-err" role="alert" className={styles.addError}>
          {state.error}
        </p>
      )}
    </form>
  );
}
