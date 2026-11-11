import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, cleanup, makeUser, serviceClient, signIn, stack, type TestUser } from './helpers';

const svc = serviceClient();
// a real 1x1 JPEG
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

let a: TestUser, b: TestUser, outsider: TestUser, removed: TestUser;
let aC: SupabaseClient, bC: SupabaseClient, outsiderC: SupabaseClient;
const uploaded: string[] = [];

const up = (c: SupabaseClient, path: string, body: Buffer | string = JPEG, contentType = 'image/jpeg') =>
  c.storage.from('avatars').upload(path, body, { contentType, upsert: false });

beforeAll(async () => {
  [a, b, outsider] = await Promise.all([makeUser({ name: 'Ava' }), makeUser({ name: 'Bo' }), makeUser({ withProfile: false })]);
  removed = await makeUser({ status: 'removed' });
  [aC, bC, outsiderC] = await Promise.all([signIn(a), signIn(b), signIn(outsider)]);
});
afterAll(async () => {
  if (uploaded.length) await svc.storage.from('avatars').remove(uploaded);
  await cleanup();
});

describe('the avatars bucket', () => {
  it('is private, small, and images only', async () => {
    const { data } = await svc.storage.getBucket('avatars');
    expect(data?.public).toBe(false);
    expect(data?.file_size_limit).toBeLessThanOrEqual(1024 * 1024);
    expect([...(data?.allowed_mime_types ?? [])].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('is not readable through a public address', async () => {
    const p = `${a.id}/public-check.jpg`;
    expect((await up(aC, p)).error).toBeNull();
    uploaded.push(p);
    const res = await fetch(`${stack().API_URL}/storage/v1/object/public/avatars/${p}`);
    expect(res.status).not.toBe(200);
  });
});

describe('uploading', () => {
  it('a member can put a photo in her own folder', async () => {
    const p = `${a.id}/avatar-1.jpg`;
    const { error } = await up(aC, p);
    expect(error).toBeNull();
    uploaded.push(p);
  });

  it('...and replace it', async () => {
    const p = `${a.id}/avatar-1.jpg`;
    const { error } = await aC.storage.from('avatars').upload(p, JPEG, { contentType: 'image/jpeg', upsert: true });
    expect(error).toBeNull();
  });

  it('not in anyone else’s folder, and not at the top level', async () => {
    expect((await up(aC, `${b.id}/hijack.jpg`)).error).not.toBeNull();
    expect((await up(aC, 'loose-file.jpg')).error).not.toBeNull();
    expect((await up(aC, `../${b.id}/x.jpg`)).error).not.toBeNull();
  });

  it('visitors, pending and removed members cannot upload', async () => {
    expect((await up(anonClient(), `${a.id}/anon.jpg`)).error).not.toBeNull();
    expect((await up(outsiderC, `${outsider.id}/pending.jpg`)).error).not.toBeNull();
    expect((await up(await signIn(removed), `${removed.id}/removed.jpg`)).error).not.toBeNull();
  });

  it('only images, and not huge ones', async () => {
    expect((await up(aC, `${a.id}/notes.txt`, 'hello', 'text/plain')).error).not.toBeNull();
    expect((await up(aC, `${a.id}/page.html`, '<script>alert(1)</script>', 'text/html')).error).not.toBeNull();
    expect((await up(aC, `${a.id}/svg.svg`, '<svg onload="alert(1)"/>', 'image/svg+xml')).error).not.toBeNull();
    expect((await up(aC, `${a.id}/big.jpg`, Buffer.alloc(2 * 1024 * 1024, 1))).error).not.toBeNull();
  });
});

describe('seeing photos', () => {
  it('other members can see them (a short-lived address); visitors and non-members cannot', async () => {
    const p = `${a.id}/avatar-1.jpg`;
    const signed = await bC.storage.from('avatars').createSignedUrl(p, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');
    expect((await anonClient().storage.from('avatars').createSignedUrl(p, 60)).error).not.toBeNull();
    expect((await outsiderC.storage.from('avatars').createSignedUrl(p, 60)).error).not.toBeNull();
    expect((await (await signIn(removed)).storage.from('avatars').createSignedUrl(p, 60)).error).not.toBeNull();
  });

  it('batch signing works for a list of members', async () => {
    const { data, error } = await bC.storage.from('avatars').createSignedUrls([`${a.id}/avatar-1.jpg`], 60);
    expect(error).toBeNull();
    expect(data?.[0]?.signedUrl).toBeTruthy();
  });
});

describe('deleting', () => {
  it('only her own photos', async () => {
    const p = `${a.id}/to-delete.jpg`;
    await up(aC, p);
    await bC.storage.from('avatars').remove([p]);
    expect((await svc.storage.from('avatars').list(a.id)).data?.map((f) => f.name)).toContain('to-delete.jpg');
    expect((await aC.storage.from('avatars').remove([p])).error).toBeNull();
    expect((await svc.storage.from('avatars').list(a.id)).data?.map((f) => f.name)).not.toContain('to-delete.jpg');
  });
});

describe('the photo on her card', () => {
  it('may only point into her own folder', async () => {
    expect((await aC.from('profiles').update({ photo_path: `${a.id}/avatar-1.jpg` }).eq('id', a.id)).error).toBeNull();
    expect((await aC.from('profiles').update({ photo_path: `${b.id}/avatar-1.jpg` }).eq('id', a.id)).error).not.toBeNull();
    expect((await aC.from('profiles').update({ photo_path: '../../etc/passwd' }).eq('id', a.id)).error).not.toBeNull();
    expect((await aC.from('profiles').update({ photo_path: null }).eq('id', a.id)).error).toBeNull();
  });
});
