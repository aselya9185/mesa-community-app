import { timingSafeEqual } from 'node:crypto';

/** only our own database may call the push endpoint: it must present the shared secret */
export function isAuthorizedPush(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
