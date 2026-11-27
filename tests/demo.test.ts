import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoMode, demoTarget, isPersona, PERSONAS } from '../src/lib/demo';
import { totp } from '../src/server/totp';
import { totp as reference } from './db/totp';

afterEach(() => vi.unstubAllEnvs());

describe('demo mode', () => {
  it('is off unless the server says exactly "true"', () => {
    for (const v of [undefined, '', '1', 'TRUE', 'false']) {
      vi.stubEnv('DEMO_MODE', v as string);
      expect(demoMode()).toBe(false);
    }
    vi.stubEnv('DEMO_MODE', 'true');
    expect(demoMode()).toBe(true);
  });

  it('offers exactly member 1, member 2 and admin', () => {
    expect(PERSONAS.map((p) => p.label)).toEqual(['member 1', 'member 2', 'admin']);
    expect(isPersona('host')).toBe(true);
    expect(isPersona('owner')).toBe(false);
  });

  it('keeps her on the same page when switching, only inside the app', () => {
    expect(demoTarget('host', '/plans/abc?tab=chat')).toBe('/plans/abc?tab=chat');
    expect(demoTarget('member', '/chats')).toBe('/chats');
    expect(demoTarget('member', '/admin/requests')).toBe('/plans');
    expect(demoTarget('member', '/members/abc?plan=def')).toBe('/members/abc?plan=def');
    expect(demoTarget('member', '/plans/abc/edit')).toBe('/plans');
    expect(demoTarget('admin', '/plans')).toBe('/admin/requests');
    expect(demoTarget('admin', '/admin/members')).toBe('/admin/members');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil.test', '', null, '/j/token', '/demo']) {
      expect(demoTarget('member', bad)).toBe('/plans');
    }
  });

  it('computes the same one-time codes as the test reference', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    for (const t of [0, 59_000, 1_700_000_000_000]) expect(totp(secret, t)).toBe(reference(secret, t));
  });
});
