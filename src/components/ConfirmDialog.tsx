'use client';

import { useRef, useState, useTransition } from 'react';
import styles from './dialog.module.css';

/**
 * A button that opens a native <dialog> (focus is trapped, Esc closes it).
 * `onConfirm` is a server action already bound to its arguments.
 */
export function ConfirmDialog({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} aria-label={triggerLabel} onClick={() => { ref.current?.showModal(); setOpen(true); }}>
        {trigger}
      </button>
      <dialog ref={ref} className={styles.dialog} aria-labelledby={open ? 'dlg-title' : undefined} onClose={() => setOpen(false)}>
        <h2 id="dlg-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.body}>{body}</p>
        <button
          type="button"
          className={styles.confirm}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await onConfirm();
              ref.current?.close();
            })
          }
        >
          {pending ? '…' : confirmLabel}
        </button>
        <button type="button" className={styles.cancel} onClick={() => ref.current?.close()}>
          {cancelLabel}
        </button>
      </dialog>
    </>
  );
}
