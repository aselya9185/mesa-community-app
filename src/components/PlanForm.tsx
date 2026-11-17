'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import authStyles from '@/components/auth.module.css';
import { createPlanAction, type PlanFormState } from '@/app/(app)/plans/actions';
import styles from './plan-form.module.css';

export type PlanDefaults = { title: string; place: string; maps: string; booking: string; date: string; time: string; plus: boolean };

const POLL_DEFAULTS = ['matcha', 'coffee', 'a walk', 'brunch'];

type Action = (prev: PlanFormState, formData: FormData) => Promise<PlanFormState>;
type Field = 'title' | 'place' | 'when' | 'maps' | 'booking';
type FieldErrors = Partial<Record<Field | 'form', string>>;

const LINK = /^https?:\/\/\S+$/i;
const stepOf = (errors: FieldErrors | undefined) => (!errors ? 0 : errors.title || errors.place || errors.maps ? 1 : errors.when || errors.booking ? 2 : 0);

/** phone: three small steps (what / when / last touches). tablet+: all on one page with a live preview. */
export function PlanForm({
  defaults,
  action = createPlanAction,
  submitLabel = 'drop it',
  heading = 'drop a plan',
  minDate,
  cancelHref = '/plans',
  mode = 'create',
}: {
  defaults: PlanDefaults;
  action?: Action;
  submitLabel?: string;
  heading?: string;
  minDate: string;
  cancelHref?: string;
  mode?: 'create' | 'edit';
}) {
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(() => stepOf(state?.errors) || 1);
  // errors the person has already started fixing stop showing (they come back if she submits again)
  const [cleared, setCleared] = useState<Partial<Record<Field, boolean>>>({});
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    // a new answer from the server: show its errors and go to the step that has the first one
    setSeen(state);
    setCleared({});
    setClientErrors({});
    const back = stepOf(state?.errors);
    if (back) setStep(back);
  }
  const e: FieldErrors = Object.fromEntries(Object.entries({ ...(state?.errors ?? {}), ...clientErrors }).filter(([k]) => !cleared[k as Field]));
  const edit = (k: Field) => () => setCleared((c) => (c[k] ? c : { ...c, [k]: true }));

  /** quick checks before moving on, so a phone does not carry a mistake to the last step (the server still decides) */
  const checkStep = (n: number): boolean => {
    const f = new FormData(formRef.current ?? undefined);
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const errs: FieldErrors = {};
    if (n === 1) {
      if (!get('title')) errs.title = 'give it a name';
      if (!get('place')) errs.place = 'say where';
      if (get('maps') && !LINK.test(get('maps'))) errs.maps = 'paste a full link starting with https://';
    }
    if (n === 2) {
      const date = get('date');
      const time = get('time');
      if (!date || !time) errs.when = 'pick a day and a time';
      else if (date < minDate || new Date(`${date}T${time}`).getTime() < Date.now()) errs.when = 'pick a time that has not happened yet';
      if (get('booking') && !LINK.test(get('booking'))) errs.booking = 'paste a full link starting with https://';
    }
    setClientErrors(errs);
    setCleared((c) => {
      const next = { ...c };
      for (const k of Object.keys(errs)) delete next[k as Field];
      return next;
    });
    return Object.keys(errs).length === 0;
  };
  const v = (k: keyof PlanDefaults) => (state ? (state.values[k] ?? '') : String(defaults[k] ?? ''));
  const plus = state ? state.values.plus === 'on' : defaults.plus;
  const [title, setTitle] = useState(defaults.title);
  const [place, setPlace] = useState(defaults.place);
  const [booking, setBooking] = useState(defaults.booking);
  const pollChecked = state ? (state.values.poll ?? '').split('|').map((l) => l.toLowerCase()) : [];
  const hostBooked = state ? state.values.booked === 'yes' : false;

  const shown = step;
  const hide = (n: number) => (shown === n ? '' : styles.hiddenOnPhone);

  return (
    <form ref={formRef} action={formAction} className={styles.form} noValidate>
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
          <input id="title" name="title" className={authStyles.input} defaultValue={v('title')} onChange={(ev) => { setTitle(ev.target.value); edit('title')(); }} maxLength={80} aria-invalid={!!e.title} aria-describedby={e.title ? 'title-err' : undefined} />
          {e.title && <span id="title-err" className={authStyles.error}>{e.title}</span>}
        </div>
        <div className={authStyles.field}>
          <label htmlFor="place" className={authStyles.label}>
            where?
          </label>
          <input id="place" name="place" className={authStyles.input} defaultValue={v('place')} onChange={(ev) => { setPlace(ev.target.value); edit('place')(); }} maxLength={120} aria-invalid={!!e.place} />
          {e.place && <span className={authStyles.error}>{e.place}</span>}
        </div>
        <div className={authStyles.field}>
          <label htmlFor="maps" className={authStyles.label}>
            google maps link <span className={authStyles.optional}>(optional)</span>
          </label>
          <input id="maps" name="maps" type="url" inputMode="url" className={authStyles.input} defaultValue={v('maps')} onChange={edit('maps')} placeholder="we make one from the place if empty" aria-invalid={!!e.maps} />
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
            <input id="date" name="date" type="date" min={minDate} className={authStyles.input} defaultValue={v('date')} onChange={edit('when')} aria-invalid={!!e.when} />
          </div>
          <div className={authStyles.field}>
            <label htmlFor="time" className={authStyles.label}>
              time
            </label>
            <input id="time" name="time" type="time" className={authStyles.input} defaultValue={v('time')} onChange={edit('when')} aria-invalid={!!e.when} />
          </div>
        </div>
        {e.when && <span className={authStyles.error}>{e.when}</span>}
        <div className={authStyles.field}>
          <label htmlFor="booking" className={authStyles.label}>
            booking link <span className={authStyles.optional}>(optional)</span>
          </label>
          <input id="booking" name="booking" type="url" inputMode="url" className={authStyles.input} defaultValue={v('booking')} onChange={(ev) => { setBooking(ev.target.value); edit('booking')(); }} aria-invalid={!!e.booking} />
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
        {mode === 'create' && booking.trim() && (
          <fieldset className={styles.radios}>
            <legend className={authStyles.label}>have you booked yet?</legend>
            <label className={styles.radio}>
              <input type="radio" name="booked" value="yes" defaultChecked={hostBooked} />
              <span>booked</span>
            </label>
            <label className={styles.radio}>
              <input type="radio" name="booked" value="no" defaultChecked={!hostBooked} />
              <span>not yet</span>
            </label>
          </fieldset>
        )}
        {mode === 'create' && (
          <fieldset className={styles.radios} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <legend className={authStyles.label}>
              plans after? <span className={authStyles.optional}>(optional: pick some to start a poll)</span>
            </legend>
            <div className={authStyles.chips}>
              {POLL_DEFAULTS.map((l) => (
                <label key={l} className={authStyles.chip}>
                  <input type="checkbox" name="poll" value={l} defaultChecked={pollChecked.includes(l)} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            <div className={authStyles.field}>
              <label htmlFor="pollCustom" className={authStyles.label}>
                add your own <span className={authStyles.optional}>(optional)</span>
              </label>
              <input id="pollCustom" name="pollCustom" className={authStyles.input} maxLength={30} defaultValue={state?.values.pollCustom ?? ''} placeholder="sunset walk" />
            </div>
          </fieldset>
        )}
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
          <button type="button" className={`${authStyles.primary} ${styles.phoneOnly}`} onClick={() => { if (checkStep(shown)) setStep(shown + 1); }}>
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
