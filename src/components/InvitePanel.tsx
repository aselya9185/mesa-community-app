'use client';

import { useState } from 'react';
import styles from './invite-panel.module.css';

export function InvitePanel({ who, message, waUrl, link, heading, intro, onBack, backLabel = 'back' }: { who: string; message: string; waUrl: string | null; link: string; heading: string; intro: string; onBack: () => void; backLabel?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // she can still select the text by hand
    }
  }
  return (
    <section className={styles.panel} aria-labelledby="invite-h">
      <span className={styles.badge} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h2 id="invite-h" className={styles.title}>
        {heading.replace('{who}', who.toLowerCase())}
      </h2>
      <p className={styles.intro}>{intro}</p>
      <p className={styles.message}>{message}</p>
      <div className={styles.buttons}>
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className={styles.primary}>
            send on whatsapp
          </a>
        ) : (
          <a href={link} className={styles.primary}>
            open her link
          </a>
        )}
        <button type="button" className={styles.outline} onClick={copy}>
          <span role="status">{copied ? 'copied' : 'copy message'}</span>
        </button>
      </div>
      <p className={styles.hint}>
        {waUrl
          ? 'whatsapp opens with the message ready, you just press send. for instagram, copy it and paste it in her dm. this link is shown only now: lost it? make a new one.'
          : 'in the club this opens whatsapp with the message ready. in the demo, open her link to join as her, then switch back with the bar at the top. it works once.'}
      </p>
      <button type="button" className={styles.back} onClick={onBack}>
        {backLabel}
      </button>
    </section>
  );
}
