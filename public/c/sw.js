/* Client portal PWA service worker — installability + light offline fallback. */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  /* Leave document navigations to the browser — intercepting them caused reload
     loops in installed PWAs when auth or query params changed. */
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const dest = event.request.destination;
  if (dest === 'script' || dest === 'worker' || dest === 'style' || dest === 'font') return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return new Response('Offline — reconnect to open this portal.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return Response.error();
    }),
  );
});
