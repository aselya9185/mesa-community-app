'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { newLinkAction, removeMemberAction, type InviteOut } from '@/app/(app)/admin/actions';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { InvitePanel } from './InvitePanel';
import styles from './members-admin.module.css';

export type MemberItem = { id: string; name: string; isAdmin: boolean; isMe: boolean; joinedAt: string; protected: boolean };
type Ok = Extract<InviteOut, { ok: true }>;

const joined = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso)).toLowerCase();

export function MembersClient({ members }: { members: MemberItem[] }) {
  const [panel, setPanel] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  // the message sits at the top of the list: bring it into view when the button pressed was far down
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'center' });
  }, [error]);

  function newLink(id: string) {
    setError(null);
    start(async () => {
      const r = await newLinkAction(id);
      if (r.ok) setPanel(r);
      else setError(r.error);
    });
  }

  if (panel) {
    return <InvitePanel who={panel.who} message={panel.message} waUrl={panel.waUrl} link={panel.link} heading="new link for {who}" intro="one-time link, expires in 24 hours. she sets a new password with it." onBack={() => setPanel(null)} backLabel="back to members" />;
  }

  return (
    <>
      <h2 className={styles.heading}>the club · {members.length}</h2>
      {error && (
        <p ref={errorRef} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {members.map((m) => (
          <li key={m.id} className={styles.row}>
            <Avatar id={m.id} name={m.name} size={40} />
            <div className={styles.who}>
              <strong>
                {m.name.toLowerCase()}
                {m.isMe ? ' (you)' : ''}
              </strong>
              <span className={styles.muted}>{m.isAdmin ? 'admin' : `joined ${joined(m.joinedAt)}`}</span>
            </div>
            {!m.isMe && m.protected && <span className={styles.muted}>protected</span>}
            {!m.isMe && !m.protected && (
              <button type="button" className={styles.outline} disabled={pending} onClick={() => newLink(m.id)}>
                new link
              </button>
            )}
            {!m.isMe && !m.isAdmin && !m.protected && (
              <ConfirmDialog
                trigger={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 11a4 4 0 10-8 0M4 20c0-3 3-5 6-5M17 14l5 5M22 14l-5 5" />
                  </svg>
                }
                triggerClassName={styles.iconBtn}
                triggerLabel={`remove ${m.name.toLowerCase()} from the club`}
                title={`remove ${m.name.split(' ')[0]!.toLowerCase()}?`}
                body="she loses access to all plans and chats right away, and plans she hosts are cancelled. she can request an invite again later."
                confirmLabel="remove from the club"
                cancelLabel="keep her"
                onConfirm={async () => {
                  setError(null);
                  const r = await removeMemberAction(m.id);
                  if (r.error) setError(r.error);
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <p className={styles.note}>new link: if someone forgets her password, send a fresh one-time link on whatsapp.</p>
    </>
  );
}
