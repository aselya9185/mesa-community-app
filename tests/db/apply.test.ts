import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleApply, LIMITS } from '../../src/server/apply';
import { cleanup, makeApplication, makeUser, randomPhone, serviceClient, type TestUser } from './helpers';

const svc = serviceClient();
const ip = () => ({ ipHash: randomBytes(6).toString('hex') });
const created: string[] = [];

async function applicationFor(phone: string) {
  const { data } = await svc.from('applications').select('id, name, instagram, status, vouched_by').eq('whatsapp_e164', phone);
  return data ?? [];
}
async function openRequests(col: 'application_id' | 'profile_id', id: string) {
  const { data } = await svc.from('link_requests').select('id').eq(col, id).is('handled_at', null);
  return data ?? [];
}

let member: TestUser;
beforeAll(async () => {
  member = await makeUser({ name: 'sofia' });
});
afterAll(async () => {
  await svc.from('link_requests').delete().in('profile_id', [member.id]);
  for (const id of created) await svc.from('link_requests').delete().eq('application_id', id);
  await cleanup();
  // applications created by the form (not by makeApplication) are removed by number below
});

describe('a new request', () => {
  it('is saved as pending and answers "listed"', async () => {
    const phone = randomPhone();
    const r = await handleApply(svc, { name: 'Nuria', instagram: '@nuria.runs', whatsapp: phone }, ip());
    expect(r.state).toBe('listed');
    const rows = await applicationFor(phone);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Nuria', instagram: '@nuria.runs', status: 'pending' });
    await svc.from('applications').delete().eq('whatsapp_e164', phone);
  });

  it('accepts a messy number and stores it normalised', async () => {
    const phone = randomPhone();
    const messy = phone.replace('+34', '0034 ');
    await handleApply(svc, { name: 'Ana', instagram: 'ana.codes', whatsapp: messy }, ip());
    expect((await applicationFor(phone))[0]?.instagram).toBe('@ana.codes');
    await svc.from('applications').delete().eq('whatsapp_e164', phone);
  });

  it('records a vouch from a real member code, ignores a fake one', async () => {
    const { data: prof } = await svc.from('profiles').select('member_code').eq('id', member.id).single();
    const p1 = randomPhone();
    const p2 = randomPhone();
    await handleApply(svc, { name: 'V', instagram: '@v1', whatsapp: p1, vouchCode: prof!.member_code as string }, ip());
    await handleApply(svc, { name: 'W', instagram: '@w1', whatsapp: p2, vouchCode: 'deadbeef0000' }, ip());
    expect((await applicationFor(p1))[0]?.vouched_by).toBe(member.id);
    expect((await applicationFor(p2))[0]?.vouched_by).toBeNull();
    await svc.from('applications').delete().in('whatsapp_e164', [p1, p2]);
  });

  it('rejects bad input with field errors and stores nothing', async () => {
    const phone = randomPhone();
    const r = await handleApply(svc, { name: '', instagram: 'not a handle!', whatsapp: '12' }, ip());
    expect(r.state).toBe('invalid');
    expect(r.errors).toHaveProperty('name');
    expect(r.errors).toHaveProperty('instagram');
    expect(r.errors).toHaveProperty('whatsapp');
    expect(await applicationFor(phone)).toHaveLength(0);
  });

  it('a filled honeypot looks like success but stores nothing', async () => {
    const phone = randomPhone();
    const r = await handleApply(svc, { name: 'Bot', instagram: '@bot', whatsapp: phone, website: 'http://spam' }, ip());
    expect(r.state).toBe('listed');
    expect(await applicationFor(phone)).toHaveLength(0);
  });
});

describe('applying twice', () => {
  it('while pending: tells her (number + instagram match) and creates no duplicate', async () => {
    const phone = randomPhone();
    await handleApply(svc, { name: 'Julia', instagram: '@julia.p', whatsapp: phone }, ip());
    const again = await handleApply(svc, { name: 'Julia', instagram: '@JULIA.P', whatsapp: phone }, ip());
    expect(again.state).toBe('pending');
    expect(await applicationFor(phone)).toHaveLength(1);
    await svc.from('applications').delete().eq('whatsapp_e164', phone);
  });

  it('with a different instagram it says nothing (so nobody can probe numbers)', async () => {
    const phone = randomPhone();
    await handleApply(svc, { name: 'Julia', instagram: '@julia.p', whatsapp: phone }, ip());
    const probe = await handleApply(svc, { name: 'Eve', instagram: '@someone.else', whatsapp: phone }, ip());
    expect(probe.state).toBe('listed');
    expect(await applicationFor(phone)).toHaveLength(1);
    await svc.from('applications').delete().eq('whatsapp_e164', phone);
  });

  it('once approved: offers a re-request; asking flags the door list exactly once', async () => {
    const app = await makeApplication({ instagram: '@mireia.y', status: 'approved' });
    created.push(app.id);
    const again = await handleApply(svc, { name: 'Mireia', instagram: '@mireia.y', whatsapp: app.phone }, ip());
    expect(again.state).toBe('approved');
    expect(await openRequests('application_id', app.id)).toHaveLength(0);

    const ask = await handleApply(svc, { instagram: '@mireia.y', whatsapp: app.phone, intent: 'request_link' }, ip());
    expect(ask.state).toBe('link_requested');
    const ask2 = await handleApply(svc, { instagram: '@mireia.y', whatsapp: app.phone, intent: 'request_link' }, ip());
    expect(ask2.state).toBe('link_requested');
    expect(await openRequests('application_id', app.id)).toHaveLength(1);
  });

  it('a re-request with the wrong instagram flags nothing', async () => {
    const app = await makeApplication({ instagram: '@mireia.z', status: 'approved' });
    created.push(app.id);
    const r = await handleApply(svc, { instagram: '@wrong', whatsapp: app.phone, intent: 'request_link' }, ip());
    expect(r.state).toBe('listed');
    expect(await openRequests('application_id', app.id)).toHaveLength(0);
  });

  it('after a rejection she can apply again as a new request', async () => {
    const app = await makeApplication({ instagram: '@rej', status: 'rejected' });
    const r = await handleApply(svc, { name: 'Again', instagram: '@rej', whatsapp: app.phone }, ip());
    expect(r.state).toBe('listed');
    const rows = await applicationFor(app.phone);
    expect(rows.filter((x) => x.status === 'pending')).toHaveLength(1);
    await svc.from('applications').delete().eq('whatsapp_e164', app.phone);
  });
});

describe('an existing member', () => {
  it('sees "member" only with number + instagram; "forgot" flags the door list', async () => {
    const ok = await handleApply(svc, { name: 's', instagram: `@${member.name}`, whatsapp: member.phone }, ip());
    expect(ok.state).toBe('member');
    const ask = await handleApply(svc, { instagram: `@${member.name}`, whatsapp: member.phone, intent: 'request_link' }, ip());
    expect(ask.state).toBe('link_requested');
    expect(await openRequests('profile_id', member.id)).toHaveLength(1);
  });

  it('with the wrong instagram nothing is revealed and nothing is created', async () => {
    const r = await handleApply(svc, { name: 'x', instagram: '@not.her', whatsapp: member.phone }, ip());
    expect(r.state).toBe('listed');
    expect(await applicationFor(member.phone)).toHaveLength(0);
  });
});

describe('spam limits', () => {
  it(`blocks after ${LIMITS.applyPerIp.max} requests per hour from the same network`, async () => {
    const same = ip();
    const states: string[] = [];
    for (let i = 0; i < LIMITS.applyPerIp.max + 2; i++) {
      const r = await handleApply(svc, { name: 'n', instagram: '@n', whatsapp: randomPhone() }, same);
      states.push(r.state);
    }
    expect(states.slice(0, LIMITS.applyPerIp.max).every((s) => s === 'listed')).toBe(true);
    expect(states.slice(LIMITS.applyPerIp.max)).toEqual(['rate_limited', 'rate_limited']);
  });
});
