import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe('the service role never reaches the browser', () => {
  const all = files('src');
  const clientFiles = all.filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8').slice(0, 200)));

  it('finds the client components it is checking', () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it.each(clientFiles)('%s imports no server-only module', (f) => {
    const src = readFileSync(f, 'utf8');
    expect(src).not.toMatch(/supabase\/service/);
    expect(src).not.toMatch(/@\/server\//);
    expect(src).not.toMatch(/SERVICE_ROLE/);
  });

  it('only the approved files touch the service client', () => {
    const users = all.filter((f) => /supabase\/service/.test(readFileSync(f, 'utf8')) && !f.endsWith('service.ts'));
    // apply form, login rate limit, join/redeem pages: server actions and server components only
    for (const f of users) expect(clientFiles).not.toContain(f);
    expect(users.length).toBeLessThan(10);
  });
});
