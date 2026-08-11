/* Admin PWA service worker — Web Push for inbox summaries + app icon badge.
   v20260811 — OTP notification tap copies code to clipboard. */

const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';
const OTP_COPY_CACHE = 'reave-otp-v1';
const OTP_COPY_URL = '/pending-otp-copy';

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

function notifyClientsDismissAlert(alertId) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: 'reave-alert-dismiss', alertId });
    }
  });
}

async function stashPendingOtpCopy(payload) {
  try {
    const cache = await caches.open(OTP_COPY_CACHE);
    await cache.put(
      OTP_COPY_URL,
      new Response(JSON.stringify({ ...payload, t: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch (e) {
    console.warn('[sw] otp stash failed', e);
  }
}

/** Focus an open admin window (or open one) and ask it to copy the OTP. */
async function deliverOtpCopy(opts) {
  const code = String(opts.code || '').trim();
  if (!code) return;
  const emailId = opts.emailId ? String(opts.emailId) : '';
  const alertId = opts.alertId ? String(opts.alertId) : '';
  const message = { type: 'reave-otp-copy', code, emailId, alertId };

  await stashPendingOtpCopy({ code, emailId, alertId });

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
    if ('focus' in client) {
      try {
        await client.focus();
      } catch {
        /* ignore */
      }
      return;
    }
  }
  if (self.clients.openWindow) {
    const opened = await self.clients.openWindow('/admin');
    if (opened) {
      try {
        opened.postMessage(message);
      } catch {
        /* page reads the stash on boot */
      }
    }
  }
}

async function deliverOtpDelete(opts) {
  const emailId = opts.emailId ? String(opts.emailId) : '';
  const alertId = opts.alertId ? String(opts.alertId) : '';
  const message = { type: 'reave-otp-delete', emailId, alertId };
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
    if ('focus' in client) {
      try {
        await client.focus();
      } catch {
        /* ignore */
      }
      return;
    }
  }
  if (alertId) await notifyClientsDismissAlert(alertId);
  if (self.clients.openWindow) {
    const url = emailId
      ? `/admin?tab=email&email=${encodeURIComponent(emailId)}`
      : '/admin';
    await self.clients.openWindow(url);
  }
}

async function openNotificationUrl(absoluteUrl) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
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
}

self.addEventListener('push', (event) => {
  let data = { title: 'New email', body: '', tag: 'inbox', url: '/admin?tab=email' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? '';
  }

  const badgeCount =
    data.badgeCount != null ? Math.max(0, Number(data.badgeCount) || 0) : null;
  const alertId = data.alertId ? String(data.alertId) : '';
  const emailId = data.emailId ? String(data.emailId) : '';
  const verificationCode = data.verificationCode ? String(data.verificationCode).trim() : '';
  const kind = data.kind ? String(data.kind) : '';
  const tag = data.tag || 'inbox';
  const isAuditAlert = String(tag).toLowerCase().startsWith('siri-proposal-');
  const isOtp = kind === 'otp' || String(tag).toLowerCase().startsWith('otp-');

  let actions = [];
  if (isOtp && verificationCode) {
    actions = [
      { action: 'copy', title: 'Copy code' },
      { action: 'delete', title: 'Delete' },
    ];
  } else if (alertId) {
    actions = isAuditAlert
      ? [{ action: 'open', title: 'View' }]
      : [
          { action: 'archive', title: 'Archive' },
          { action: 'open', title: 'View' },
        ];
  }

  const tasks = [
    self.registration.showNotification(data.title, {
      body: data.body,
      tag,
      icon: '/api/branding/icon?size=192',
      badge: '/api/branding/icon?size=192',
      data: {
        url: data.url || '/admin?tab=email',
        alertId,
        emailId,
        verificationCode,
        kind: isOtp ? 'otp' : kind,
      },
      actions,
    }),
    notifyClientsInboxPush(),
  ];
  if (badgeCount != null) tasks.push(writeBadgeCount(badgeCount));

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'reave-badge-sync') {
    event.waitUntil(writeBadgeCount(Number(event.data.count) || 0));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteData = event.notification.data || {};
  const alertId = noteData.alertId ? String(noteData.alertId) : '';
  const emailId = noteData.emailId ? String(noteData.emailId) : '';
  const verificationCode = noteData.verificationCode
    ? String(noteData.verificationCode).trim()
    : '';
  const kind = noteData.kind ? String(noteData.kind) : '';
  const tag = event.notification.tag ? String(event.notification.tag) : '';
  const isOtp =
    kind === 'otp' || tag.toLowerCase().startsWith('otp-') || Boolean(verificationCode);
  const url = noteData.url || '/admin?tab=email';
  const absoluteUrl = new URL(url, self.location.origin).href;
  const action = event.action || '';

  if (isOtp && verificationCode && (action === 'copy' || action === '' || action === 'open')) {
    event.waitUntil(
      Promise.all([deliverOtpCopy({ code: verificationCode, emailId, alertId }), notifyClientsInboxPush()]),
    );
    return;
  }

  if (isOtp && action === 'delete') {
    event.waitUntil(
      Promise.all([
        deliverOtpDelete({ emailId, alertId }),
        notifyClientsInboxPush(),
      ]),
    );
    return;
  }

  if (action === 'archive' && alertId) {
    event.waitUntil(
      Promise.all([
        notifyClientsDismissAlert(alertId),
        notifyClientsInboxPush(),
      ]),
    );
    return;
  }

  event.waitUntil(
    Promise.all([notifyClientsInboxPush(), openNotificationUrl(absoluteUrl)]),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      restoreBadgeFromCache(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== BADGE_CACHE && key !== OTP_COPY_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

/* Network-first fetch handler — required for reliable Chromium install prompts.
   Leave document navigations to the browser; intercepting them caused reload loops
   in installed PWAs when the shell URL changed (tab params, auth, etc.). */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  const { pathname } = new URL(event.request.url);
  if (pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return new Response('Offline — reconnect to use the admin app.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      throw new Error('Network error');
    }),
  );
});
