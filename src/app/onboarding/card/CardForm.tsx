'use client';

import { useActionState } from 'react';
import styles from '@/components/auth.module.css';
import type { Me } from '@/lib/auth';
import { LIKES } from '@/lib/likes';
import { saveCardAction, type CardState } from './actions';

export function CardForm({ me }: { me: Me }) {
  const [state, action, pending] = useActionState<CardState, FormData>(saveCardAction, null);
  const errors = state?.errors;
  return (
    <form action={action} className={styles.form}>
      <h1 className={styles.title}>make your card</h1>
      <p className={styles.sub}>this is how members see you. your whatsapp number never shows here.</p>

      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          your name
        </label>
        <input id="name" name="name" className={styles.input} defaultValue={me.name} maxLength={60} aria-invalid={!!errors?.name} required />
        {errors?.name && <span className={styles.error}>{errors.name}</span>}
      </div>
      <div className={styles.field}>
        <label htmlFor="area" className={styles.label}>
          area
        </label>
        <input id="area" name="area" className={styles.input} defaultValue={me.area ?? ''} placeholder="gràcia, poblenou…" maxLength={60} />
      </div>
      <div className={styles.field}>
        <label htmlFor="instagram" className={styles.label}>
          instagram
        </label>
        <input id="instagram" name="instagram" className={styles.input} defaultValue={me.instagram ?? ''} autoCapitalize="none" aria-invalid={!!errors?.instagram} />
        <span className={errors?.instagram ? styles.error : styles.hint}>{errors?.instagram ?? 'shown on your card so members can find you'}</span>
      </div>
      <div className={styles.field}>
        <label htmlFor="trainsAt" className={styles.label}>
          where do you train?
        </label>
        <input id="trainsAt" name="trainsAt" className={styles.input} defaultValue={me.trains_at.join(', ')} placeholder="separate places with commas" />
        <span className={styles.hint}>so members can see who trains where</span>
      </div>
      <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={styles.label} style={{ padding: 0, marginBottom: 6 }}>
          i like
        </legend>
        <div className={styles.chips}>
          {LIKES.map((l) => (
            <label key={l} className={styles.chip}>
              <input type="checkbox" name="likes" value={l} defaultChecked={me.likes.includes(l)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.field}>
        <label htmlFor="bio" className={styles.label}>
          bio <span className={styles.optional}>(optional)</span>
        </label>
        <textarea id="bio" name="bio" rows={3} className={styles.textarea} defaultValue={me.bio ?? ''} maxLength={280} />
      </div>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'saving…' : 'done'}
      </button>
    </form>
  );
}
