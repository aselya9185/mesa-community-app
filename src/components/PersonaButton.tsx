'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/** a submit button naming a demo person; shows that something is happening on the one that was pressed */
export function PersonaButton({ value, className, current, children }: { value: string; className?: string; current?: boolean; children: React.ReactNode }) {
  const { pending, data } = useFormStatus();
  const [pressed, setPressed] = useState(false);
  const busy = pending && (data ? data.get('persona') === value : pressed);
  return (
    <button type="submit" name="persona" value={value} className={className} disabled={pending} aria-current={current ? 'true' : undefined} aria-busy={busy} onClick={() => setPressed(true)}>
      {children}
    </button>
  );
}
