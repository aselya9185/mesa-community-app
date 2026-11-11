// mesa service worker: shows web push notifications and opens the right screen when tapped.
// (The offline shell and install support are added with the PWA polish.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // she is looking at the app right now: the badge and the chat already show it
      if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      await self.registration.showNotification(data.title || 'mesa', {
        body: data.body || '',
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || '/plans' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/plans';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) return w.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
