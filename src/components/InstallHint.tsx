'use client';

import { useEffect, useState } from 'react';
import styles from './install-hint.module.css';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const KEY = 'mesa-install-dismissed';

/** "add mesa to your home screen": a button on Android/desktop Chrome, instructions on iPhone */
export function InstallHint() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios'>('hidden');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {
      // private window: just show it
    }
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setMode('prompt');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    const timer = ios ? setTimeout(() => setMode('ios'), 0) : undefined;
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // fine
    }
    setMode('hidden');
  }

  if (mode === 'hidden') return null;
  return (
    <div className={styles.box}>
      <p className={styles.text}>
        {mode === 'ios' ? (
          <>
            add mesa to your home screen: tap <b>share</b>, then <b>add to home screen</b>. you&apos;ll need it for pings on iphone.
          </>
        ) : (
          'add mesa to your home screen: it opens full screen, like an app.'
        )}
      </p>
      {mode === 'prompt' && event && (
        <button
          type="button"
          className={styles.btn}
          onClick={async () => {
            await event.prompt();
            const choice = await event.userChoice;
            if (choice.outcome === 'accepted') setMode('hidden');
          }}
        >
          add
        </button>
      )}
      <button type="button" className={styles.quiet} onClick={dismiss}>
        not now
      </button>
    </div>
  );
}
