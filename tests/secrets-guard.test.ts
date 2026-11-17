import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Nothing that looks like a real secret may be committed. This is a cheap, dependency-free second line after .gitignore.
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !/(^|\/)(package-lock\.json|\.env\.example)$/.test(f) && !f.endsWith('secrets-guard.test.ts') && !/\.(png|jpe?g|webp|ico|woff2?)$/.test(f));

const PATTERNS: [string, RegExp][] = [
  ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['a private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['a JWT (service role or user token)', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
  ['a filled-in private env value', /^(?:VAPID_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|PUSH_WEBHOOK_SECRET)=\S{12,}/m],
  ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
];

describe('no secrets in tracked files', () => {
  it('has files to check', () => {
    expect(tracked.length).toBeGreaterThan(20);
  });

  it.each(PATTERNS)('contains no %s', (_name, pattern) => {
    const hits = tracked.filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('keeps real env files out of git', () => {
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f))).toEqual([]);
  });
});
