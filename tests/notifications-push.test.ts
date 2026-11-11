import { describe, expect, it, vi } from 'vitest';
import { notificationText, type NotificationRow } from '../src/lib/notification-text';
import { pushForNotification, type PushSender } from '../src/server/push';
import { isAuthorizedPush } from '../src/server/push-auth';

const base = (over: Partial<NotificationRow>): NotificationRow => ({
  id: 'n1', user_id: 'u1', type: 'new_plan', plan_id: 'p1', read_at: null, created_at: '2026-11-11T10:00:00Z',
  data: { actor: 'laia', title: 'Zumba, first class free', starts_at: '2026-11-15T18:00:00Z' }, ...over,
});

describe('notification wording (lowercase house style)', () => {
  it('new plan: who dropped what and when, in Barcelona time', () => {
    const t = notificationText(base({}));
    expect(t.title).toBe('new plan');
    expect(t.body).toBe('laia dropped Zumba, first class free · sun 15 nov, 19:00');
    expect(t.url).toBe('/plans/p1');
  });
  it('someone joined', () => {
    expect(notificationText(base({ type: 'joined', data: { actor: 'anna', title: 'Zumba' } })).body).toBe('anna is in for Zumba');
  });
  it('the +1 goes straight to the plan', () => {
    const t = notificationText(base({ type: 'plus_one', data: { title: 'Zumba' } }));
    expect(t.title).toBe('you got the +1');
    expect(t.url).toBe('/plans/p1');
  });
  it('one message shows a preview; several show a count; both open the chat', () => {
    const one = notificationText(base({ type: 'message', data: { actor: 'anna', title: 'Zumba', preview: 'who has a mat?', count: 1 } }));
    expect(one.body).toBe('anna: who has a mat?');
    expect(one.url).toBe('/plans/p1?tab=chat');
    expect(notificationText(base({ type: 'message', data: { actor: 'anna', title: 'Zumba', preview: 'x', count: 3 } })).body).toBe('3 new messages in Zumba');
  });
  it('edited and cancelled', () => {
    expect(notificationText(base({ type: 'plan_edited', data: { actor: 'laia', title: 'Zumba' } })).body).toBe('laia changed Zumba');
    expect(notificationText(base({ type: 'plan_cancelled', data: { actor: 'laia', title: 'Zumba' } })).title).toBe('plan cancelled');
  });
  it('copes with missing data', () => {
    expect(() => notificationText(base({ type: 'message', data: {} }))).not.toThrow();
  });
});

function fakeDb(sub: { endpoint: string; p256dh: string; auth: string }[], note: NotificationRow | null) {
  const removed: string[] = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'notifications' ? note : null }),
          then: (res: (v: { data: unknown }) => void) => res({ data: table === 'push_subscriptions' ? sub : [] }),
        }),
      }),
      delete: () => ({ eq: async (...args: string[]) => void removed.push(args[1] ?? '') }),
    }),
  };
  return { db: db as never, removed };
}

describe('sending a push', () => {
  const subs = [
    { endpoint: 'https://push.example/a', p256dh: 'k1', auth: 's1' },
    { endpoint: 'https://push.example/b', p256dh: 'k2', auth: 's2' },
  ];

  it('sends the readable text and the link to every device', async () => {
    const { db } = fakeDb(subs, base({}));
    const send = vi.fn<PushSender>().mockResolvedValue(undefined);
    const r = await pushForNotification(db, 'n1', send);
    expect(r).toEqual({ sent: 2, removed: 0 });
    const payload = JSON.parse(send.mock.calls[0]![1]);
    expect(payload).toMatchObject({ title: 'new plan', url: '/plans/p1' });
    expect(payload.body).toContain('Zumba');
  });

  it('forgets devices that no longer exist (404/410) and keeps going on other errors', async () => {
    const { db, removed } = fakeDb(subs, base({}));
    const send = vi.fn<PushSender>()
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { statusCode: 500 }));
    const r = await pushForNotification(db, 'n1', send);
    expect(r).toEqual({ sent: 0, removed: 1 });
    expect(removed).toEqual(['https://push.example/a']);
  });

  it('does nothing for an unknown or already-read notification', async () => {
    const send = vi.fn<PushSender>();
    expect(await pushForNotification(fakeDb(subs, null).db, 'nope', send)).toEqual({ sent: 0, removed: 0 });
    expect(await pushForNotification(fakeDb(subs, base({ read_at: '2026-11-11T11:00:00Z' })).db, 'n1', send)).toEqual({ sent: 0, removed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the push endpoint only answers the database', () => {
  it.each([
    [undefined, 'secret'],
    ['', 'secret'],
    ['wrong', 'secret'],
    ['secret', ''],
    ['secret', undefined],
  ])('rejects header %s with configured secret %s', (header, secret) => {
    expect(isAuthorizedPush(header as string | undefined, secret as string | undefined)).toBe(false);
  });
  it('accepts the exact secret', () => {
    expect(isAuthorizedPush('a-long-shared-secret', 'a-long-shared-secret')).toBe(true);
  });
});
