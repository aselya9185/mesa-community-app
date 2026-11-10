import Link from 'next/link';

export default function PlanNotFound() {
  return (
    <div style={{ padding: '64px 24px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <h1 style={{ fontSize: 38 }}>can&apos;t find that plan</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>it may have been cancelled, or the link is old.</p>
      <Link href="/plans" style={{ color: 'var(--pink-soft)', fontWeight: 700, textDecoration: 'underline', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        back to this week
      </Link>
    </div>
  );
}
