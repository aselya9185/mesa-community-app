'use client';

import { useState } from 'react';
import styles from './share.module.css';

export function ShareButton({ path, label = 'share plan link', title }: { path: string; label?: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // she closed the share sheet: nothing to do
    }
  }
  return (
    <button type="button" className={styles.btn} onClick={share}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
      </svg>
      <span role="status">{copied ? 'link copied' : label}</span>
    </button>
  );
}
