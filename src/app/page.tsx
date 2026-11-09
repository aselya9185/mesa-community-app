import styles from './page.module.css';

// placeholder landing page, replaced by the apply flow in M2
export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.kicker}>closed club · bcn</p>
      <h1 className={styles.title}>mesa</h1>
      <p className={styles.lead}>a closed girls club in barcelona. coming soon.</p>
    </main>
  );
}
