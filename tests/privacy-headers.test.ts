import { describe, expect, it } from 'vitest';
import config from '../next.config';
import robots from '../src/app/robots';

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  const headers = config.headers;
  if (!headers) throw new Error('next.config must define headers()');
  return (await headers()) as HeaderRule[];
}

function valueFor(all: HeaderRule[], source: string, key: string): string | undefined {
  return all.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;
}

describe('crawler privacy', () => {
  it('robots.txt disallows everything for every user agent', () => {
    const { rules: r } = robots();
    const list = Array.isArray(r) ? r : [r];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userAgent: '*', disallow: '/' });
  });

  it('every route sends X-Robots-Tag noindex', async () => {
    const value = valueFor(await rules(), '/:path*', 'X-Robots-Tag');
    expect(value).toContain('noindex');
    expect(value).toContain('nofollow');
  });
});

describe('secret-bearing routes', () => {
  it('invite links never leak through the referrer', async () => {
    expect(valueFor(await rules(), '/join/:path*', 'Referrer-Policy')).toBe('no-referrer');
  });

  it('api responses are not cached', async () => {
    expect(valueFor(await rules(), '/api/:path*', 'Cache-Control')).toBe('no-store');
  });

  it('does not advertise the framework', () => {
    expect(config.poweredByHeader).toBe(false);
  });
});
