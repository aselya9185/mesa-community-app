import { describe, expect, it } from 'vitest';
import { anonClient } from './helpers';

describe('keep-alive health check', () => {
  it('anyone can ask, and it says yes without revealing anything', async () => {
    const { data, error } = await anonClient().rpc('health');
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});
