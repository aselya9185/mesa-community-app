import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { PersonaButton } from '@/components/PersonaButton';
import { PERSONAS } from '@/lib/demo';
import { demoActive } from '@/server/demo-active';
import { enterDemoAction } from './actions';
import styles from './demo.module.css';

export const metadata: Metadata = { title: 'try the demo · mesa', description: 'try mesa in one click, with fake people and plans.' };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  const { problem } = await searchParams;
  if (!(await demoActive())) redirect('/login');
  return (
    <AuthShell kicker="live demo · fake data">
      <h1 className={styles.title}>try mesa</h1>
      <p className={styles.lead}>a closed girls club for plans in barcelona. pick who to be: no sign-up, no password. you can switch any time.</p>
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem === 'busy' ? 'lots of visits from your network just now. wait a few minutes and try again.' : "that didn't work. try again in a moment."}
        </p>
      )}
      <form action={enterDemoAction} className={styles.cards}>
        {PERSONAS.map((p) => (
          <PersonaButton key={p.key} value={p.key} className={styles.card}>
            <span className={styles.cardTop}>
              <strong>{p.label}</strong>
              <span className={styles.who}>{p.who}</span>
            </span>
            <span className={styles.summary}>{p.summary}</span>
            <span className={styles.tries}>{p.tries}</span>
          </PersonaButton>
        ))}
      </form>
      <p className={styles.small}>everyone here is made up, and the demo starts fresh every night. numbers, photos and pings are switched off.</p>
      <p className={styles.small}>
        curious how members get in?{' '}
        <Link href="/apply" className={styles.link}>
          see the invite request
        </Link>
      </p>
    </AuthShell>
  );
}
