'use client';

import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Avatar } from './Avatar';
import styles from './photo-field.module.css';

/** center-crop to a square and shrink to at most 512px, so a phone photo becomes ~50 KB */
async function toAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(512, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('could not encode');
  return blob;
}

export function PhotoField({ userId, name, currentUrl, off = false }: { userId: string; name: string; currentUrl: string | null; off?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [path, setPath] = useState<string | null>(null); // a new upload, saved with the card
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      setError('pick a photo, under 20 mb.');
      return;
    }
    setBusy(true);
    try {
      const blob = await toAvatar(file);
      const next = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: err } = await supabaseBrowser().storage.from('avatars').upload(next, blob, { contentType: 'image/jpeg', upsert: false });
      if (err) throw err;
      setPath(next);
      setRemoved(false);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError("couldn't upload that photo. try another one.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  if (off) {
    return (
      <div className={styles.field}>
        <Avatar id={userId} name={name || '?'} size={72} src={null} />
        <span className={styles.hint}>photos are switched off in the demo.</span>
      </div>
    );
  }

  return (
    <div className={styles.field}>
      <Avatar id={userId} name={name || '?'} size={72} src={removed ? null : preview} />
      <div className={styles.side}>
        <div className={styles.buttons}>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'uploading…' : preview && !removed ? 'change photo' : 'add a photo'}
          </button>
          {preview && !removed && (
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setRemoved(true);
                setPath(null);
              }}
            >
              remove
            </button>
          )}
        </div>
        <span className={styles.hint}>a real photo of you</span>
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
      </div>
      <input ref={input} id="photo-file" type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="choose a photo" onChange={(e) => void pick(e.target.files?.[0])} />
      <input type="hidden" name="photoPath" value={path ?? ''} />
      <input type="hidden" name="photoRemove" value={removed ? '1' : ''} />
    </div>
  );
}
