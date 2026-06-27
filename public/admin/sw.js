/* Admin PWA service worker — Web Push for inbox summaries. */

self.addEventListener('push', (event) => {
  let data = { title: 'New email', body: '', tag: 'inbox', url: '/admin?tab=email' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? '';
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || 'inbox',
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      data: { url: data.url || '/admin?tab=email' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin?tab=email';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
