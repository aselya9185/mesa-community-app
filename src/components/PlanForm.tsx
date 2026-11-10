'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import authStyles from '@/components/auth.module.css';
import { createPlanAction, type PlanFormState } from '@/app/(app)/plans/actions';
import styles from './plan-form.module.css';

export type PlanDefaults = { title: string; place: string; maps: string; booking: string; date: string; time: string; plus: boolean };

type Action = (prev: PlanFormState, formData: FormData) => Promise<PlanFormState>;

/** phone: three small steps (what / when / last touches). tablet+: all on one page with a live preview. */
export function PlanForm({
  defaults,
  action = createPlanAction,
  submitLabel = 'drop it',
  heading = 'drop a plan',
  minDate,
  cancelHref = '/plans',
}: {
  defaults: PlanDefaults;
  action?: Action;
  submitLabel?: string;
  heading?: string;
  minDate: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(action, null);
  const [step, setStep] = useState(1);
  const e = state?.errors ?? {};
  const v = (k: keyof PlanDefaults) => (state ? (state.values[k] ?? '') : String(defaults[k] ?? ''));
  const plus = state ? state.values.plus === 'on' : defaults.plus;
  const [title, setTitle] = useState(defaults.title);
  const [place, setPlace] = useState(defaults.place);

  // after an error, jump back to the step that has it
  const errStep = e.title || e.place || e.maps ? 1 : e.when || e.booking ? 2 : 0;
  const shown = state && errStep ? errStep : step;
  const hide = (n: number) => (shown === n ? '' : styles.hiddenOnPhone);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>
            <span className={styles.stepCount}>{shown}/3</span> a class, a run, a matcha, anything
          </p>
          <h1 className={styles.title}>{heading}</h1>
        </div>
        <Link href={cancelHref} className={styles.never}>
          never mind
        </Link>
      </header>

      <fieldset className={`${styles.step} ${hide(1)}`}>
        <legend className={styles.legend}>
          <span className={styles.num}>1</span>what&apos;s the plan?
        </legend>
        <div className={authStyles.field}>
          <label htmlFor="title" className={authStyles.label}>
            what are you doing?
          </label>
          <input id="title" name="title" className={authStyles.input} defaultValue={v('title')} onChange={(ev) => setTitle(ev.target.value)} maxLength={80} aria-invalid={!!e.title} aria-describedby={e.title ? 'title-err' : undefined} />
          {e.title && <span id="title-err" className={authStyles.error}>{e.title}</span>}
        </div>
        <div className={authStyles.field}>
          <label htmlFor="place" className={authStyles.label}>
            where?
          </label>
          <input id="place" name="place" className={authStyles.input} defaultValue={v('place')} onChange={(ev) => setPlace(ev.target.value)} maxLength={120} aria-invalid={!!e.place} />
          {e.place && <span className={authStyles.error}>{e.place}</span>}
        </div>
        <div className={authStyles.field}>
          <label htmlFor="maps" className={authStyles.label}>
            google maps link <span className={authStyles.optional}>(optional)</span>
          </label>
          <input id="maps" name="maps" type="url" inputMode="url" className={authStyles.input} defaultValue={v('maps')} placeholder="we make one from the place if empty" aria-invalid={!!e.maps} />
          {e.maps && <span className={authStyles.error}>{e.maps}</span>}
        </div>
      </fieldset>

      <fieldset className={`${styles.step} ${hide(2)}`}>
        <legend className={styles.legend}>
          <span className={styles.num}>2</span>when and how to join
        </legend>
        <div className={styles.row}>
          <div className={authStyles.field}>
            <label htmlFor="date" className={authStyles.label}>
              day
            </label>
            <input id="date" name="date" type="date" min={minDate} className={authStyles.input} defaultValue={v('date')} aria-invalid={!!e.when} />
          </div>
          <div className={authStyles.field}>
            <label htmlFor="time" className={authStyles.label}>
              time
            </label>
            <input id="time" name="time" type="time" className={authStyles.input} defaultValue={v('time')} aria-invalid={!!e.when} />
          </div>
        </div>
        {e.when && <span className={authStyles.error}>{e.when}</span>}
        <div className={authStyles.field}>
          <label htmlFor="booking" className={authStyles.label}>
            booking link <span className={authStyles.optional}>(optional)</span>
          </label>
          <input id="booking" name="booking" type="url" inputMode="url" className={authStyles.input} defaultValue={v('booking')} aria-invalid={!!e.booking} />
          <span className={e.booking ? authStyles.error : authStyles.hint}>{e.booking ?? 'any page where people book: a gym, classpass, a tasting… no link means no booking step.'}</span>
        </div>
      </fieldset>

      <fieldset className={`${styles.step} ${hide(3)}`}>
        <legend className={styles.legend}>
          <span className={styles.num}>3</span>last touches
        </legend>
        <label className={styles.switchRow}>
          <span>
            <strong>i can bring a free +1</strong>
            <span className={authStyles.hint}> one person comes free. others can still join.</span>
          </span>
          <input type="checkbox" name="plus" role="switch" defaultChecked={plus} className={styles.switch} />
        </label>
        {title.trim() && (
          <p className={styles.preview} aria-live="polite">
            <span className={authStyles.hint}>how it lands</span>
            <strong>{title}</strong>
            <span>{place}</span>
          </p>
        )}
      </fieldset>

      {e.form && (
        <p role="alert" className={authStyles.alert}>
          {e.form}
        </p>
      )}

      <div className={styles.buttons}>
        {shown > 1 && (
          <button type="button" className={`${authStyles.secondary} ${styles.phoneOnly}`} onClick={() => setStep(shown - 1)}>
            back
          </button>
        )}
        {shown < 3 && (
          <button type="button" className={`${authStyles.primary} ${styles.phoneOnly}`} onClick={() => setStep(shown + 1)}>
            next
          </button>
        )}
        <button type="submit" className={`${authStyles.primary} ${shown < 3 ? styles.hiddenOnPhone : ''}`} disabled={pending}>
          {pending ? 'saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
