import { afterAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, makeUser, serviceClient, signIn } from './helpers';

afterAll(cleanup);

describe('rate limiter', () => {
  it('allows up to the limit then blocks', async () => {
    const key = `test:${Math.random()}`;
    const svc = serviceClient();
    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) results.push((await svc.rpc('rate_limit_hit', { p_key: key, p_max: 3, p_window_seconds: 60 })).data);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts keys separately', async () => {
    const svc = serviceClient();
    const a = `test:a:${Math.random()}`;
    const b = `test:b:${Math.random()}`;
    await svc.rpc('rate_limit_hit', { p_key: a, p_max: 1, p_window_seconds: 60 });
    expect((await svc.rpc('rate_limit_hit', { p_key: a, p_max: 1, p_window_seconds: 60 })).data).toBe(false);
    expect((await svc.rpc('rate_limit_hit', { p_key: b, p_max: 1, p_window_seconds: 60 })).data).toBe(true);
  });

  it('is not callable by visitors or members', async () => {
    const m = await makeUser();
    for (const c of [anonClient(), await signIn(m)]) {
      expect((await c.rpc('rate_limit_hit', { p_key: 'x', p_max: 1, p_window_seconds: 60 })).error).not.toBeNull();
    }
  });
});
