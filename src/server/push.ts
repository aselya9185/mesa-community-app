import type { SupabaseClient } from '@supabase/supabase-js';
import { notificationText, type NotificationRow } from '@/lib/notification-text';

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/**
 * Send one notification to every device its owner subscribed. Runs with the SERVICE client
 * (called by our own database through /api/push). Devices that no longer exist are forgotten.
 */
export async function pushForNotification(svc: SupabaseClient, notificationId: string, send: PushSender): Promise<{ sent: number; removed: number }> {
  const { data: note } = await svc
    .from('notifications')
    .select('id, user_id, type, plan_id, data, read_at, created_at')
    .eq('id', notificationId)
    .maybeSingle();
  const n = note as NotificationRow | null;
  if (!n || n.read_at) return { sent: 0, removed: 0 };

  const { data: subs } = await svc.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', n.user_id);
  const text = notificationText(n);
  const payload = JSON.stringify({ title: text.title, body: text.body, url: text.url, tag: n.plan_id ? `${n.type}:${n.plan_id}` : n.type });

  let sent = 0;
  let removed = 0;
  for (const s of (subs ?? []) as PushSub[]) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await svc.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        removed++;
      }
      // other errors: leave the device, try again next time. Never log the endpoint or keys.
    }
  }
  return { sent, removed };
}
