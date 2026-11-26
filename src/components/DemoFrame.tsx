import { Suspense } from 'react';
import { demoActive } from '@/server/demo-active';
import { DemoBar } from './DemoBar';
import styles from './demo-frame.module.css';

/** the demo bar on pages outside the app shell (invite link, new card). Just the page anywhere else. */
export async function DemoFrame({ current, children }: { current: string | null; children: React.ReactNode }) {
  if (!(await demoActive())) return <>{children}</>;
  return (
    <div className={styles.frame}>
      <Suspense>
        <DemoBar current={current} />
      </Suspense>
      {children}
    </div>
  );
}
