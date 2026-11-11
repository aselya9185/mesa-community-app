// The "m" mark, drawn as a bold shape (no font needed): used for the app icons.
export function IconArt({ letter }: { letter: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 20% 15%, #4a1230, #0E0A0F 65%)',
      }}
    >
      <svg width={letter} height={letter} viewBox="0 0 48 48" fill="none">
        <path d="M9 38V14M9 24C9 12 24 12 24 24V38M24 24C24 12 39 12 39 24V38" stroke="#FF2E93" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
