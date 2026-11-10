import { afterAll, describe, expect, it } from 'vitest';
import { anonClient, cleanup, loginEmail, makeUser, randomPhone, serviceClient, signIn } from './helpers';

afterAll(cleanup);

describe('auth lockdown', () => {
  it('the public anon key cannot create an account', async () => {
    const phone = randomPhone();
    const { data, error } = await anonClient().auth.signUp({ email: loginEmail(phone), password: 'sup3r-secret-pw' });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it('anonymous sign-ins are off', async () => {
    const { error } = await anonClient().auth.signInAnonymously();
    expect(error).not.toBeNull();
  });

  it('passwords shorter than 8 characters are refused', async () => {
    const phone = randomPhone();
    const { error } = await serviceClient().auth.admin.createUser({
      email: loginEmail(phone),
      password: 'short1',
      email_confirm: true,
    });
    expect(error).not.toBeNull();
  });
});

describe('whatsapp-number login via a synthetic address (spike)', () => {
  it('accepts the reserved .invalid domain and signs in with number + password', async () => {
    const u = await makeUser();
    const c = await signIn(u);
    const { data } = await c.auth.getUser();
    expect(data.user?.id).toBe(u.id);
    expect(data.user?.email).toBe(loginEmail(u.phone));
  });

  it('a wrong password does not sign in', async () => {
    const u = await makeUser();
    const { error } = await anonClient().auth.signInWithPassword({ email: loginEmail(u.phone), password: 'not-the-password' });
    expect(error).not.toBeNull();
  });

  it('a password reset by the server changes the credential', async () => {
    const u = await makeUser();
    const svc = serviceClient();
    const { error } = await svc.auth.admin.updateUserById(u.id, { password: 'brand-new-password' });
    expect(error).toBeNull();
    const old = await anonClient().auth.signInWithPassword({ email: loginEmail(u.phone), password: u.password });
    expect(old.error).not.toBeNull();
    const fresh = await anonClient().auth.signInWithPassword({ email: loginEmail(u.phone), password: 'brand-new-password' });
    expect(fresh.error).toBeNull();
  });

  it('a banned (removed) user cannot sign in', async () => {
    const u = await makeUser();
    await serviceClient().auth.admin.updateUserById(u.id, { ban_duration: '876000h' });
    const { error } = await anonClient().auth.signInWithPassword({ email: loginEmail(u.phone), password: u.password });
    expect(error).not.toBeNull();
  });
});
