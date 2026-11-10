import type { Metadata } from 'next';
import styles from './pane.module.css';

export const metadata: Metadata = { title: 'plans · mesa' };

// phone: the list (in the layout) is the page. tablet/desktop: this is the empty right pane.
export default function PlansIndex() {
  return (
    <div className={styles.placeholder}>
      <h2>pick a plan</h2>
      <p>tap one on the left to see who&apos;s going.</p>
    </div>
  );
}
