import { createHash } from 'node:crypto';
import { headers } from 'next/headers';

/** a stable, non-reversible id for "this network", for rate limits. We never store the raw IP. */
export async function ipHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`mesa-ip:${ip}`).digest('hex').slice(0, 24);
}
