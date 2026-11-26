import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, makeUser, serviceClient, signIn, signInAal2, type TestUser } from './helpers';

// An instagram handle is private by default. Phone numbers are admin-only already; this is the same idea for the handle:
// other members see it only if she turns on "show my instagram on my card". The admin always sees it (door list, vouching).

let ana: TestUser; // handle public
let bea: TestUser; // handle private (the default)
let cora: TestUser; // another member
let gone: TestUser; // removed, handle was public
let boss: TestUser; // admin
let pending: TestUser; // signed in, never approved

const handlesSeenBy = async (c: Awaited<ReturnType<typeof signIn>>) => {
  const { data, error } = await c.from('member_instagram').select('user_id, handle');
  expect(error).toBeNull();
  return new Map((data ?? []).map((r) => [r.user_id as string, r.handle as string]));
};

beforeAll(async () => {
  ana = await makeUser({ name: 'ana', instagramPublic: true });
  bea = await makeUser({ name: 'bea' });
  cora = await makeUser({ name: 'cora' });
  gone = await makeUser({ name: 'gone', status: 'removed', instagramPublic: true });
  boss = await makeUser({ name: 'boss', role: 'admin' });
  pending = await makeUser({ withProfile: false });
});

afterAll(cleanup);

describe('handles are private unless she opts in', () => {
  it('a member sees a public handle but not a private one', async () => {
    const seen = await handlesSeenBy(await signIn(cora));
    expect(seen.get(ana.id)).toBe('@ana');
    expect(seen.has(bea.id)).toBe(false);
  });

  it('she always sees her own handle, public or not', async () => {
    const seen = await handlesSeenBy(await signIn(bea));
    expect(seen.get(bea.id)).toBe('@bea');
  });

  it('a removed member\'s handle disappears for everyone, even if it was public', async () => {
    const seen = await handlesSeenBy(await signIn(cora));
    expect(seen.has(gone.id)).toBe(false);
  });

  it('a removed member, a visitor and someone never approved read nothing', async () => {
    expect((await handlesSeenBy(await signIn(gone))).size).toBe(0);
    expect((await anonClient().from('member_instagram').select('*')).data ?? []).toHaveLength(0);
    expect((await handlesSeenBy(await signIn(pending))).size).toBe(0);
  });

  it('turning the switch on shows it to others, turning it off hides it again', async () => {
    const me = await signIn(bea);
    const on = await me.from('member_instagram').update({ is_public: true }).eq('user_id', bea.id).select('is_public');
    expect(on.error).toBeNull();
    expect((await handlesSeenBy(await signIn(cora))).get(bea.id)).toBe('@bea');

    const off = await me.from('member_instagram').update({ is_public: false }).eq('user_id', bea.id).select('is_public');
    expect(off.error).toBeNull();
    expect((await handlesSeenBy(await signIn(cora))).has(bea.id)).toBe(false);
  });
});

describe('only she can change her own handle settings', () => {
  it('another member cannot change someone else\'s switch or handle', async () => {
    const other = await signIn(cora);
    const flip = await other.from('member_instagram').update({ is_public: true }).eq('user_id', bea.id).select();
    expect(flip.data ?? []).toHaveLength(0); // RLS hides the row, so nothing was updated
    const rename = await other.from('member_instagram').update({ handle: '@hacked' }).eq('user_id', bea.id).select();
    expect(rename.data ?? []).toHaveLength(0);
    expect(((await serviceClient().from('member_instagram').select('handle, is_public').eq('user_id', bea.id).single()).data)).toEqual({ handle: '@bea', is_public: false });
  });

  it('a member cannot create or delete a row for someone else', async () => {
    const other = await signIn(cora);
    const ins = await other.from('member_instagram').insert({ user_id: bea.id, handle: '@x' });
    expect(ins.error).not.toBeNull();
    const del = await other.from('member_instagram').delete().eq('user_id', bea.id).select();
    expect(del.data ?? []).toHaveLength(0);
  });

  it('she can change her own handle and remove it', async () => {
    const me = await signIn(cora);
    const upd = await me.from('member_instagram').update({ handle: '@cora.new' }).eq('user_id', cora.id).select('handle');
    expect(upd.data).toEqual([{ handle: '@cora.new' }]);
    const del = await me.from('member_instagram').delete().eq('user_id', cora.id).select('user_id');
    expect(del.data).toHaveLength(1);
    const back = await me.from('member_instagram').insert({ user_id: cora.id, handle: '@cora' });
    expect(back.error).toBeNull();
  });

  it('the handle has a sane length', async () => {
    const me = await signIn(cora);
    const long = await me.from('member_instagram').update({ handle: '@' + 'a'.repeat(60) }).eq('user_id', cora.id);
    expect(long.error).not.toBeNull();
  });
});

describe('the admin', () => {
  it('sees every handle, private or public, once signed in with two-step sign-in', async () => {
    const seen = await handlesSeenBy(await signInAal2(boss));
    expect(seen.get(bea.id)).toBe('@bea');
    expect(seen.get(ana.id)).toBe('@ana');
  });

  it('without two-step sign-in is just a member: no private handles', async () => {
    const seen = await handlesSeenBy(await signIn(boss));
    expect(seen.has(bea.id)).toBe(false);
  });
});

describe('the old public column is gone', () => {
  it('profiles no longer has an instagram column that every member could read', async () => {
    const { error } = await (await signIn(cora)).from('profiles').select('instagram').limit(1);
    expect(error).not.toBeNull();
  });

  it('erasing a profile erases the handle with it', async () => {
    const svc = serviceClient();
    const temp = await makeUser({ name: 'temp' });
    expect((await svc.from('member_instagram').select('user_id').eq('user_id', temp.id)).data).toHaveLength(1);
    await svc.from('profiles').delete().eq('id', temp.id);
    expect((await svc.from('member_instagram').select('user_id').eq('user_id', temp.id)).data).toHaveLength(0);
  });
});

describe('privacy cannot be left behind', () => {
  it('removing a member switches her handle back to private', async () => {
    const temp = await makeUser({ name: 'leaver', instagramPublic: true });
    const { error } = await (await signInAal2(boss)).rpc('admin_remove_member', { p_user: temp.id });
    expect(error).toBeNull();
    const { data } = await serviceClient().from('member_instagram').select('is_public').eq('user_id', temp.id).single();
    expect(data?.is_public).toBe(false);
  });

  it('is private by default when a row is created without saying otherwise', async () => {
    const temp = await makeUser({ name: 'plain' });
    const svc = serviceClient();
    await svc.from('member_instagram').delete().eq('user_id', temp.id);
    await svc.from('member_instagram').insert({ user_id: temp.id, handle: '@plain' });
    expect((await svc.from('member_instagram').select('is_public').eq('user_id', temp.id).single()).data?.is_public).toBe(false);
  });

  it.each(['   ', '@', '@ana maria', 'https://instagram.com/ana', '@@ana'])('refuses the handle %j', async (handle) => {
    const me = await signIn(cora);
    const { error } = await me.from('member_instagram').update({ handle }).eq('user_id', cora.id);
    expect(error).not.toBeNull();
  });
});
