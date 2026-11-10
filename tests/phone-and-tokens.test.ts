import { describe, expect, it } from 'vitest';
import { handleKey, isValidHandle } from '../src/lib/instagram';
import { loginEmail, normalizePhone, waDigits } from '../src/lib/phone';
import { generateToken, hashToken, isWellFormedToken, TOKEN_LENGTH } from '../src/server/tokens';

describe('phone numbers', () => {
  it.each([
    ['+34 600 11 12 22', '+34600111222'],
    ['600111222', '+34600111222'],
    ['0034 600 111 222', '+34600111222'],
    ['  +34-600-111-222 ', '+34600111222'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '123', '+34 12', '+999999999999999999'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('builds the synthetic login address and wa.me digits', () => {
    expect(loginEmail('+34600111222')).toBe('34600111222@members.mesa.invalid');
    expect(waDigits('+34600111222')).toBe('34600111222');
  });
});

describe('instagram handles', () => {
  it('accepts normal handles with or without @', () => {
    expect(isValidHandle('@laia.moves')).toBe(true);
    expect(isValidHandle('laia_moves')).toBe(true);
  });
  it('rejects junk', () => {
    expect(isValidHandle('')).toBe(false);
    expect(isValidHandle('la ia')).toBe(false);
    expect(isValidHandle('<script>')).toBe(false);
  });
  it('compares case-insensitively and ignores @', () => {
    expect(handleKey(' @Laia.Moves ')).toBe('laia.moves');
  });
});

describe('invite tokens', () => {
  it('are 32 lowercase base32 characters (160 bits)', () => {
    const t = generateToken();
    expect(t).toHaveLength(TOKEN_LENGTH);
    expect(t).toMatch(/^[0-9a-hjkmnp-tv-z]{32}$/);
    expect(isWellFormedToken(t)).toBe(true);
  });
  it('are unique', () => {
    expect(new Set(Array.from({ length: 500 }, generateToken)).size).toBe(500);
  });
  it('hash to 64 hex chars and never contain the token', () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
  });
  it('rejects malformed tokens before touching the database', () => {
    expect(isWellFormedToken('short')).toBe(false);
    expect(isWellFormedToken('A'.repeat(32))).toBe(false);
    expect(isWellFormedToken('a/b'.repeat(12))).toBe(false);
  });
});
