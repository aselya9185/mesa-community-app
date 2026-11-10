import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, makeApplication, makeUser, serviceClient, signIn, signInAal2, type TestUser } from './helpers';

let member: TestUser;
let admin: TestUser;
let appId: string;

beforeAll(async () => {
  member = await makeUser();
  admin = await makeUser({ role: 'admin' });
  appId = (await makeApplication()).id;
  await serviceClient().from('link_requests').insert({ application_id: appId });
});
afterAll(async () => {
  await serviceClient().from('link_requests').delete().eq('application_id', appId);
  await cleanup();
});

describe('link requests', () => {
  it('visitors and members read nothing and cannot create requests', async () => {
    for (const c of [anonClient(), await signIn(member)]) {
      const { data } = await c.from('link_requests').select('id');
      expect(data ?? []).toHaveLength(0);
      expect((await c.from('link_requests').insert({ application_id: appId })).error).not.toBeNull();
    }
  });

  it('only one open request per person', async () => {
    const dupe = await serviceClient().from('link_requests').insert({ application_id: appId });
    expect(dupe.error).not.toBeNull();
  });

  it('the admin (with MFA) sees them and can mark them handled', async () => {
    const c = await signInAal2(admin);
    const { data } = await c.from('link_requests').select('id, application_id, handled_at').eq('application_id', appId);
    expect(data).toHaveLength(1);
    const upd = await c.from('link_requests').update({ handled_at: new Date().toISOString() }).eq('id', data![0]!.id);
    expect(upd.error).toBeNull();
    // handled: a new open one may be created again
    const again = await serviceClient().from('link_requests').insert({ application_id: appId });
    expect(again.error).toBeNull();
  });

  it('a request needs exactly one subject', async () => {
    const svc = serviceClient();
    expect((await svc.from('link_requests').insert({})).error).not.toBeNull();
    expect((await svc.from('link_requests').insert({ application_id: appId, profile_id: member.id })).error).not.toBeNull();
  });
});
