import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { z } from 'zod';
import { supabaseService } from '@/lib/supabase/service';
import { pushForNotification } from '@/server/push';
import { isAuthorizedPush } from '@/server/push-auth';

// Called by OUR database (pg_net) when a notification is created. Not a public API: it needs the shared secret.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ notification_id: z.string().uuid() });

export async function POST(request: Request) {
  if (!isAuthorizedPush(request.headers.get('x-push-secret'), process.env.PUSH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return NextResponse.json({ error: 'push is not configured' }, { status: 503 });
  setVapidDetails(subject, publicKey, privateKey);

  const result = await pushForNotification(supabaseService(), parsed.data.notification_id, (sub, payload) =>
    sendNotification(sub, payload, { TTL: 3600, urgency: 'normal' }),
  );
  return NextResponse.json(result);
}
