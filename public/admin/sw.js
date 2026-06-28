/* Admin PWA service worker — Web Push for inbox summaries + app icon badge. */

const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_URL);
    if (!res) return 0;
    return parseInt(await res.text(), 10) || 0;
  } catch {
    return 0;
  }
}

async function writeBadgeCount(n) {
  if (!('setAppBadge' in navigator)) return;
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (n <= 0) {
      await cache.delete(BADGE_URL);
      if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
      return;
    }
    await cache.put(BADGE_URL, new Response(String(n)));
    await navigator.setAppBadge(n);
  } catch (e) {
    console.warn('[sw] badge failed', e);
  }
}

async function incrementBadgeCount() {
  await writeBadgeCount((await readBadgeCount()) + 1);
}

function notifyClientsInboxPush() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: 'reave-inbox-push' });
    }
  });
}

self.addEventListener('push', (event) => {
  let data = { title: 'New email', body: '', tag: 'inbox', url: '/admin?tab=email' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? '';
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag || 'inbox',
        icon: '/favicon-192.png',
        badge: '/favicon-192.png',
        data: { url: data.url || '/admin?tab=email' },
      }),
      incrementBadgeCount(),
      notifyClientsInboxPush(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin?tab=email';
  event.waitUntil(
    Promise.all([
      writeBadgeCount(0),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
    ]),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
