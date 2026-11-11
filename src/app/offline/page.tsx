import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'offline · mesa' };

// Shown by the service worker when there is no connection. Self-contained (inline styles only) so it
// still looks right when nothing else can be loaded.
export default function OfflinePage() {
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 14,
        padding: 32,
        background: 'radial-gradient(circle 420px at 0 0, rgba(255,46,147,0.2), transparent 70%), #0E0A0F',
        color: '#FFF1F7',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>closed club · bcn</span>
      <h1 style={{ margin: 0, fontSize: 56, lineHeight: 1, letterSpacing: '-0.03em', color: '#FF2E93', fontWeight: 800 }}>you&apos;re offline</h1>
      <p style={{ margin: 0, maxWidth: 320, fontSize: 18, lineHeight: 1.45, color: '#B79AA9' }}>
        no signal right now. your plans and chats are safe: they&apos;ll be back as soon as you are.
      </p>
      {/* a plain link on purpose: offline, only a full page load can find out we are back */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/plans"
        style={{ marginTop: 8, minHeight: 52, padding: '0 28px', borderRadius: 26, background: '#FF2E93', color: '#0E0A0F', fontWeight: 700, fontSize: 17, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
      >
        try again
      </a>
    </main>
  );
}
