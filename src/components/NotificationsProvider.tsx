'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Ctx = { unread: number; refresh: () => void };
const NotificationsContext = createContext<Ctx>({ unread: 0, refresh: () => undefined });

export function useNotifications(): Ctx {
  return useContext(NotificationsContext);
}

/** one live subscription for the whole app: the unread count follows new, read and deleted notifications */
export function NotificationsProvider({ userId, initialUnread, children }: { userId: string; initialUnread: number; children: React.ReactNode }) {
  const [unread, setUnread] = useState(initialUnread);

  const refresh = useCallback(async () => {
    const { count } = await supabaseBrowser().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (typeof count === 'number') setUnread(count);
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | undefined;
    let cancelled = false;
    (async () => {
      // listen as HER (her token), or row level security would hide everything
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
      channel = sb
        .channel(`notifications:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void refresh())
        .subscribe();
    })();
    // safety net for networks that block live connections
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) void sb.removeChannel(channel);
    };
  }, [userId, refresh]);

  const value = useMemo(() => ({ unread, refresh: () => void refresh() }), [unread, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
