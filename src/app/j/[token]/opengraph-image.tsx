import { ImageResponse } from 'next/og';

// The preview card people see when the link lands in WhatsApp or Instagram.
// It never reads the token and says nothing about who was invited.
export const alt = "you're invited to mesa";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          color: '#FFF1F7',
          background: 'linear-gradient(160deg, rgba(14,10,15,0.1), rgba(14,10,15,0.92) 80%), #7A1A16',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', fontWeight: 700 }}>closed club · bcn</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 220, fontWeight: 800, color: '#FF2E93', lineHeight: 0.9, letterSpacing: -8 }}>mesa</div>
          <div style={{ fontSize: 48, marginTop: 16 }}>you&apos;re invited. tap to get in.</div>
        </div>
      </div>
    ),
    size,
  );
}
