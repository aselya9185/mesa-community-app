import { createHash, randomBytes } from 'node:crypto';

// Crockford base32, lowercase: no i, l, o, u (they get misread). 32 symbols = 5 bits each,
// and 256 is divisible by 32 so mapping a byte with `& 31` has no bias.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const TOKEN_LENGTH = 32; // 32 chars x 5 bits = 160 bits

export function generateToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: string): boolean {
  return token.length >= 32 && token.length <= 64 && /^[0-9a-z]+$/.test(token);
}
