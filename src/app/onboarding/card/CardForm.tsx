'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import styles from '@/components/auth.module.css';
import type { Me } from '@/lib/auth';
import { PhotoField } from '@/components/PhotoField';
import { LIKES } from '@/lib/likes';
import { saveCardAction, type CardState } from './actions';

export function CardForm({ me, photoUrl = null, next = '/plans', heading = 'make your card' }: { me: Me; photoUrl?: string | null; next?: string; heading?: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(saveCardAction, null);
  const errors = state?.errors;
  const form = useRef<HTMLFormElement>(null);
  // the fields are rebuilt after a failed save, so put the keyboard back on the first one that needs fixing
  useEffect(() => {
    if (state) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  // after an error the fields show what she submitted, not what is saved
  const v = state?.values ?? {
    name: me.name,
    area: me.area ?? '',
    instagram: me.instagram ?? '',
    instagramPublic: me.instagramPublic,
    trainsAt: me.trains_at.join(', '),
    likes: me.likes,
    bio: me.bio ?? '',
  };
  return (
    <form ref={form} action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <h1 className={styles.title}>{heading}</h1>
      <p className={styles.sub}>this is how members see you. your whatsapp number never shows here.</p>

      <PhotoField userId={me.id} name={me.name} currentUrl={photoUrl} off={me.is_demo} />

      {/* a new key after each failed save: the browser resets a submitted form, so the fields are rebuilt from `v`.
          Without this her "show my instagram" choice would silently tick itself again. */}
      <div key={state?.attempt ?? 0} style={{ display: 'contents' }}>

      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          your name
        </label>
        <input id="name" name="name" className={styles.input} defaultValue={v.name} maxLength={60} aria-invalid={!!errors?.name} required />
        {errors?.name && <span className={styles.error}>{errors.name}</span>}
      </div>
      <div className={styles.field}>
        <label htmlFor="area" className={styles.label}>
          area
        </label>
        <input id="area" name="area" className={styles.input} defaultValue={v.area} placeholder="gràcia, poblenou…" maxLength={60} />
      </div>
      <InstagramField handle={v.instagram} isPublic={v.instagramPublic} error={errors?.instagram} />
      <div className={styles.field}>
        <label htmlFor="trainsAt" className={styles.label}>
          where do you train?
        </label>
        <input id="trainsAt" name="trainsAt" className={styles.input} defaultValue={v.trainsAt} placeholder="separate places with commas" maxLength={300} aria-invalid={!!errors?.trainsAt} />
        <span className={errors?.trainsAt ? styles.error : styles.hint}>{errors?.trainsAt ?? 'so members can see who trains where'}</span>
      </div>
      <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={styles.label} style={{ padding: 0, marginBottom: 6 }}>
          i like
        </legend>
        <div className={styles.chips}>
          {LIKES.map((l) => (
            <label key={l} className={styles.chip}>
              <input type="checkbox" name="likes" value={l} defaultChecked={v.likes.includes(l)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.field}>
        <label htmlFor="bio" className={styles.label}>
          bio <span className={styles.optional}>(optional)</span>
        </label>
        <textarea id="bio" name="bio" rows={3} className={styles.textarea} defaultValue={v.bio} maxLength={280} />
      </div>
      </div>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? 'saving…' : 'done'}
      </button>
    </form>
  );
}

function InstagramField({ handle, isPublic, error }: { handle: string; isPublic: boolean; error?: string }) {
  const [shown, setShown] = useState(isPublic);
  return (
    <div className={styles.field}>
      <label htmlFor="instagram" className={styles.label}>
        instagram
      </label>
      <input id="instagram" name="instagram" className={styles.input} defaultValue={handle} autoCapitalize="none" autoCorrect="off" aria-invalid={!!error} aria-describedby="ig-hint" />
      <span id="ig-hint" className={error ? styles.error : styles.hint}>
        {error ?? (shown ? 'members can see it on your card. the admin sees it too.' : 'private: only the club admin sees it, to check your request.')}
      </span>
      <label className={styles.checkRow}>
        <input type="checkbox" name="instagramPublic" checked={shown} onChange={(ev) => setShown(ev.target.checked)} />
        <span>show my instagram on my card, so other members can find me</span>
      </label>
    </div>
  );
}
