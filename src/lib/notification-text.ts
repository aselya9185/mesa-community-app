import { dayParts } from './time';

export type NotificationType = 'new_plan' | 'joined' | 'plus_one' | 'message' | 'plan_edited' | 'plan_cancelled';

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  plan_id: string | null;
  data: { actor?: string; title?: string; starts_at?: string; preview?: string; count?: number };
  read_at: string | null;
  created_at: string;
};

export type NotificationText = { title: string; body: string; url: string; icon: 'plan' | 'person' | 'gift' | 'chat' | 'edit' | 'cancel' };

/** the one place that words a notification: the inbox and the push both use it (lowercase house style) */
export function notificationText(n: NotificationRow): NotificationText {
  const d = n.data ?? {};
  const actor = d.actor ?? 'someone';
  const title = d.title ?? 'a plan';
  const url = n.plan_id ? `/plans/${n.plan_id}` : '/plans';
  switch (n.type) {
    case 'new_plan': {
      const when = d.starts_at ? dayParts(d.starts_at) : null;
      return { title: 'new plan', body: `${actor} dropped ${title}${when ? ` · ${when.long}, ${when.time}` : ''}`, url, icon: 'plan' };
    }
    case 'joined':
      return { title: 'someone joined your plan', body: `${actor} is in for ${title}`, url, icon: 'person' };
    case 'plus_one':
      return { title: 'you got the +1', body: `the host gave you the free +1 for ${title}`, url, icon: 'gift' };
    case 'message': {
      const count = d.count ?? 1;
      return { title: title, body: count > 1 ? `${count} new messages in ${title}` : `${actor}: ${d.preview ?? ''}`.trim(), url: `${url}?tab=chat`, icon: 'chat' };
    }
    case 'plan_edited':
      return { title: 'plan changed', body: `${actor} changed ${title}`, url, icon: 'edit' };
    case 'plan_cancelled':
      return { title: 'plan cancelled', body: `${actor} cancelled ${title}`, url, icon: 'cancel' };
  }
}
