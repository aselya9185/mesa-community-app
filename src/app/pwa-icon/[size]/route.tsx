import { ImageResponse } from 'next/og';
import { IconArt } from '@/lib/icon-art';

// The app icon, drawn on demand: a pink "m" on black. "maskable" keeps the letter inside the safe zone
// so phones can crop it to a circle or a squircle.
export const runtime = 'nodejs';

const SIZES: Record<string, { px: number; letter: number }> = {
  '192': { px: 192, letter: 120 },
  '512': { px: 512, letter: 320 },
  maskable: { px: 512, letter: 230 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const cfg = SIZES[size];
  if (!cfg) return new Response('not found', { status: 404 });
  return new ImageResponse(<IconArt letter={cfg.letter} />, { width: cfg.px, height: cfg.px });
}
