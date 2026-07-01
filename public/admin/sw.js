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

async function decrementBadgeCount() {
  await writeBadgeCount(Math.max(0, (await readBadgeCount()) - 1));
}

async function restoreBadgeFromCache() {
  await writeBadgeCount(await readBadgeCount());
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'reave-badge-sync') {
    event.waitUntil(writeBadgeCount(Number(event.data.count) || 0));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin?tab=email';
  const absoluteUrl = new URL(url, self.location.origin).href;
  event.waitUntil(
    Promise.all([
      decrementBadgeCount(),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({ type: 'reave-notification-open', url: absoluteUrl });
            if ('navigate' in client) {
              try {
                await client.navigate(absoluteUrl);
              } catch {
                /* postMessage handler opens the target when navigate is unavailable */
              }
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(absoluteUrl);
      }),
    ]),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), restoreBadgeFromCache()]));
});
