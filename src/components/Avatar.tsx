import styles from './avatar.module.css';

const COLORS = ['#FF7AB8', '#C9A0DC', '#FFC2DC', '#F7D4A8'];

export function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export function Avatar({ id, name, size = 36, overlap = false }: { id: string; name: string; size?: number; overlap?: boolean }) {
  return (
    <span
      className={`${styles.avatar} ${overlap ? styles.overlap : ''}`}
      style={{ width: size, height: size, background: colorFor(id), fontSize: Math.round(size * 0.36), borderRadius: Math.round(size / 3) }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
