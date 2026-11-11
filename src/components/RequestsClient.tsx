'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { newLinkAction, rejectAction, resendInviteAction, approveAction, type InviteOut } from '@/app/(app)/admin/actions';
import { ago } from '@/lib/ago';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { InvitePanel } from './InvitePanel';
import styles from './requests.module.css';

export type RequestItem = { id: string; name: string; instagram: string; whatsapp: string; createdAt: string; joined: boolean; vouchedBy: string | null };
export type LinkRequestItem = { id: string; applicationId: string | null; profileId: string | null; name: string; createdAt: string };
type Status = 'pending' | 'approved' | 'rejected';
type Ok = Extract<InviteOut, { ok: true }>;

export function RequestsClient({ status, counts, items, linkRequests }: { status: Status; counts: Record<Status, number>; items: RequestItem[]; linkRequests: LinkRequestItem[] }) {
  const [panel, setPanel] = useState<(Ok & { heading: string; intro: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<InviteOut>, heading: string, intro: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) setPanel({ ...r, heading, intro });
      else setError(r.error);
    });
  }

  if (panel) {
    return <InvitePanel who={panel.who} message={panel.message} waUrl={panel.waUrl} heading={panel.heading} intro={panel.intro} onBack={() => setPanel(null)} backLabel="back to requests" />;
  }

  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {linkRequests.length > 0 && (
        <section className={styles.flags} aria-labelledby="flags-h">
          <h2 id="flags-h" className={styles.sectionTitle}>
            asking for a new link
          </h2>
          {linkRequests.map((l) => (
            <div key={l.id} className={styles.flag}>
              <div className={styles.flagText}>
                <strong>{l.name.toLowerCase()}</strong>
                <span className={styles.muted}>{l.profileId ? 'forgot her password' : "didn't get her invite link"} · {ago(l.createdAt)}</span>
              </div>
              <button
                type="button"
                className={styles.primary}
                disabled={pending}
                onClick={() =>
                  l.applicationId
                    ? run(() => resendInviteAction(l.applicationId!), "{who}'s link", 'send her this. the link is hers alone: works once, expires in 7 days.')
                    : run(() => newLinkAction(l.profileId!), 'new link for {who}', 'one-time link, expires in 24 hours. she sets a new password with it.')
                }
              >
                send new link
              </button>
            </div>
          ))}
        </section>
      )}

      <div className={styles.subtabs} role="tablist" aria-label="request status">
        {(['pending', 'approved', 'rejected'] as Status[]).map((s) => (
          <Link key={s} href={`/admin/requests?status=${s}`} role="tab" aria-selected={s === status} className={`${styles.subtab} ${s === status ? styles.subOn : ''}`}>
            {s} <span>{counts[s]}</span>
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <h2>{status === 'pending' ? 'door is quiet' : `no ${status} requests`}</h2>
          <p>{status === 'pending' ? 'no requests waiting. when a girl asks for an invite, she shows up here.' : 'nothing here yet.'}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.top}>
                <Avatar id={r.id} name={r.name} size={40} />
                <div className={styles.who}>
                  <strong>{r.name.toLowerCase()}</strong>
                  <span className={styles.muted}>{ago(r.createdAt)}</span>
                </div>
                {r.vouchedBy && <span className={styles.vouch}>vouched by {r.vouchedBy}</span>}
              </div>
              <p className={styles.details}>
                instagram <b>{r.instagram}</b> · whatsapp <b>{r.whatsapp}</b>
              </p>
              {status === 'pending' && (
                <div className={styles.actions}>
                  <ConfirmDialog
                    trigger="reject"
                    triggerClassName={styles.quiet}
                    title="reject her?"
                    body={`${r.name} will not be notified automatically. you can message her yourself if you want to.`}
                    confirmLabel="reject request"
                    cancelLabel="keep pending"
                    onConfirm={() => rejectAction(r.id)}
                  />
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending}
                    onClick={() => run(() => approveAction(r.id), "{who}'s in", 'send her this. the link is hers alone: works once, expires in 7 days.')}
                  >
                    approve
                  </button>
                </div>
              )}
              {status === 'approved' &&
                (r.joined ? (
                  <p className={styles.joined}>she&apos;s in</p>
                ) : (
                  <div className={styles.actions}>
                    <button type="button" className={styles.outline} disabled={pending} onClick={() => run(() => resendInviteAction(r.id), "{who}'s link", 'send her this. the link is hers alone: works once, expires in 7 days.')}>
                      send again
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
