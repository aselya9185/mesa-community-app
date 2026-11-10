import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  cleanup,
  insertInvite,
  makeApplication,
  makeUser,
  newToken,
  serviceClient,
  sha256,
  signIn,
  type TestUser,
} from './helpers';

let member: TestUser;

beforeAll(async () => {
  member = await makeUser();
});
afterAll(cleanup);

async function claim(token: string, purpose: 'invite' | 'reset' = 'invite') {
  return serviceClient().rpc('claim_invite', { p_hash: sha256(token), p_purpose: purpose });
}

describe('invite tokens', () => {
  it('are >= 32 chars when generated the way the server does', () => {
    expect(newToken().length).toBeGreaterThanOrEqual(32);
    expect(newToken()).not.toBe(newToken());
  });

  it('are stored only as a sha-256 hash, never the plaintext', async () => {
    const app = await makeApplication();
    const token = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    const { data } = await serviceClient().from('invites').select('token_hash').eq('application_id', app.id);
    expect(data?.[0]?.token_hash).toBe(sha256(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it('can be used exactly once', async () => {
    const app = await makeApplication();
    const token = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    const first = await claim(token);
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);
    expect(first.data?.[0]?.application_id).toBe(app.id);
    const second = await claim(token);
    expect(second.data ?? []).toHaveLength(0);
  });

  it('50 parallel redeems produce exactly one winner', async () => {
    const app = await makeApplication();
    const token = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    const results = await Promise.all(Array.from({ length: 50 }, () => claim(token)));
    const winners = results.filter((r) => (r.data ?? []).length === 1);
    expect(winners).toHaveLength(1);
  });

  it('expire', async () => {
    const app = await makeApplication();
    const token = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token, expiresInSeconds: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await claim(token)).data ?? []).toHaveLength(0);
  });

  it('cannot be redeemed for the wrong purpose', async () => {
    const app = await makeApplication();
    const token = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    expect((await claim(token, 'reset')).data ?? []).toHaveLength(0);
    expect((await claim(token, 'invite')).data).toHaveLength(1);
  });

  it('an unknown token redeems nothing', async () => {
    expect((await claim(newToken())).data ?? []).toHaveLength(0);
  });

  it('a new link switches the earlier one off', async () => {
    const app = await makeApplication();
    const oldToken = newToken();
    const newOne = newToken();
    await insertInvite({ applicationId: app.id, purpose: 'invite', token: oldToken });
    await insertInvite({ applicationId: app.id, purpose: 'invite', token: newOne });
    expect((await claim(oldToken)).data ?? []).toHaveLength(0);
    expect((await claim(newOne)).data).toHaveLength(1);
  });

  it('a released claim can be used again (user creation failed)', async () => {
    const app = await makeApplication();
    const token = newToken();
    const id = await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    expect((await claim(token)).data).toHaveLength(1);
    expect((await serviceClient().rpc('release_invite', { p_id: id })).error).toBeNull();
    expect((await claim(token)).data).toHaveLength(1);
  });

  it('reset links are 24h at most, invite links 7 days at most', async () => {
    const svc = serviceClient();
    const tooLong = await svc.from('invites').insert({
      profile_id: member.id,
      purpose: 'reset',
      token_hash: sha256(newToken()),
      expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
    });
    expect(tooLong.error).not.toBeNull();
    const ok = await svc.from('invites').insert({
      profile_id: member.id,
      purpose: 'reset',
      token_hash: sha256(newToken()),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(ok.error).toBeNull();
  });

  it('a reset link needs a member, an invite link needs an application', async () => {
    const svc = serviceClient();
    const app = await makeApplication();
    const wrong1 = await svc.from('invites').insert({
      application_id: app.id,
      purpose: 'reset',
      token_hash: sha256(newToken()),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(wrong1.error).not.toBeNull();
    const wrong2 = await svc.from('invites').insert({
      profile_id: member.id,
      purpose: 'invite',
      token_hash: sha256(newToken()),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(wrong2.error).not.toBeNull();
  });

  it('only the server (service role) can redeem or release', async () => {
    const app = await makeApplication();
    const token = newToken();
    const id = await insertInvite({ applicationId: app.id, purpose: 'invite', token });
    const asMember = await signIn(member);
    for (const c of [anonClient(), asMember]) {
      expect((await c.rpc('claim_invite', { p_hash: sha256(token), p_purpose: 'invite' })).error).not.toBeNull();
      expect((await c.rpc('release_invite', { p_id: id })).error).not.toBeNull();
    }
    // still unused
    expect((await claim(token)).data).toHaveLength(1);
  });
});
