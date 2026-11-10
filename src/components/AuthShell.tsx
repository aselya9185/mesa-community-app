import styles from './auth.module.css';

/** mobile: one column. desktop: checker art on the left, the form on the right (design D9/D10). */
export function AuthShell({ children, kicker = 'closed club · bcn' }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.art} aria-hidden="true">
        <span className={styles.kicker}>{kicker}</span>
        <div>
          <div className={styles.wordmark}>mesa</div>
          <p className={styles.artLead}>a closed girls club in barcelona. classes, runs, walks, matcha. bring a friend if she&apos;s one of us.</p>
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.banner} aria-hidden="true">
          <span className={styles.kicker}>{kicker}</span>
        </div>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

export function CheckBadge() {
  return (
    <span className={styles.badge} aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
