'use client';

import { removeMemberAction, resolveReportAction } from '@/app/(app)/admin/actions';
import { ago } from '@/lib/ago';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './reports-admin.module.css';

export type ReportItem = { id: string; reason: string; note: string | null; createdAt: string; reporter: string; reportedId: string; reported: string; canRemove: boolean; plan: string | null };

const REASONS: Record<string, string> = {
  uncomfortable: 'made her feel uncomfortable',
  spam_or_fake: 'spam or a fake profile',
  no_show: "didn't show up",
  other: 'something else',
};

export function ReportsClient({ items }: { items: ReportItem[] }) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>all quiet</h2>
        <p>no open reports. when a member reports someone, it shows up here.</p>
      </div>
    );
  }
  return (
    <ul className={styles.list}>
      {items.map((r) => (
        <li key={r.id} className={styles.card}>
          <p className={styles.line}>
            <b>{r.reporter.toLowerCase()}</b> reported <b>{r.reported.toLowerCase()}</b>
          </p>
          <p className={styles.reason}>
            {REASONS[r.reason] ?? r.reason}
            {r.plan ? ` · ${r.plan}` : ''} · {ago(r.createdAt)}
          </p>
          {r.note && <p className={styles.note}>&ldquo;{r.note}&rdquo;</p>}
          <div className={styles.actions}>
            <form action={resolveReportAction.bind(null, r.id)}>
              <button type="submit" className={styles.outline}>
                mark resolved
              </button>
            </form>
            {r.canRemove && (
              <ConfirmDialog
                trigger={`remove ${r.reported.split(' ')[0]!.toLowerCase()}`}
                triggerClassName={styles.quiet}
                title={`remove ${r.reported.split(' ')[0]!.toLowerCase()}?`}
                body="she loses access to all plans and chats right away, and plans she hosts are cancelled. she can request an invite again later."
                confirmLabel="remove from the club"
                cancelLabel="keep her"
                onConfirm={async () => {
                  await removeMemberAction(r.reportedId);
                  await resolveReportAction(r.id);
                }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
