'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { enterDemoAction } from '@/app/demo/actions';
import { PERSONAS } from '@/lib/demo';
import { PersonaButton } from './PersonaButton';
import styles from './demo-bar.module.css';

/** always on screen in the demo: says the data is fake and switches person without logging in or out */
export function DemoBar({ current }: { current: string | null }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <aside className={styles.bar} aria-label="demo" data-demo-bar>
      <p className={styles.tag}>
        <strong>demo</strong>
        <span>fake data</span>
      </p>
      <form action={enterDemoAction} className={styles.switch}>
        <input type="hidden" name="next" value={query ? `${pathname}?${query}` : pathname} />
        <span className={styles.label} id="viewing-as">
          viewing as
        </span>
        <div className={styles.options} role="group" aria-labelledby="viewing-as">
          {PERSONAS.map((p) => (
            <PersonaButton key={p.key} value={p.key} current={current === p.key} className={styles.option}>
              {p.label}
            </PersonaButton>
          ))}
        </div>
      </form>
    </aside>
  );
}
