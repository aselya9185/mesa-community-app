'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import styles from './enable-push.module.css';

type State = 'checking' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function detect(): Promise<State> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iPhones only allow pings for apps added to the home screen
    return /iphone|ipad/i.test(navigator.userAgent) ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  // if the service worker never comes up, don't leave her waiting
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export function EnablePush({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void detect().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      const json = sub.toJSON();
      const { error: err } = await supabaseBrowser().rpc('save_push_subscription', {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
        p_ua: navigator.userAgent,
      });
      if (err) throw err;
      setState('on');
    } catch {
      setError("couldn't turn on pings. try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabaseBrowser().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') return null;
  const copy: Record<Exclude<State, 'checking'>, string> = {
    unsupported: "this browser can't do pings. you'll still see everything in here.",
    'needs-install': 'on iphone, add mesa to your home screen first, then come back here to turn on pings.',
    blocked: 'pings are blocked for mesa. allow notifications in your browser settings to turn them on.',
    off: 'get a ping when a plan drops or you get the +1.',
    on: "pings are on for this device. you'll hear about new plans, the +1 and messages.",
  };
  return (
    <div className={`${styles.box} ${state === 'on' ? styles.on : ''}`}>
      <p className={styles.text}>{copy[state]}</p>
      {state === 'off' && (
        <button type="button" className={styles.btn} onClick={turnOn} disabled={busy}>
          {busy ? '…' : 'turn on'}
        </button>
      )}
      {state === 'on' && (
        <button type="button" className={styles.quiet} onClick={turnOff} disabled={busy}>
          turn off
        </button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
