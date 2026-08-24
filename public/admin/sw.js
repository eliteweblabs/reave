/* Admin PWA service worker — Web Push for inbox summaries + app icon badge.
   v20260824b — OTP tap always opens /admin/copy so the gesture can write the clipboard. */

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
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (n <= 0) {
      await cache.delete(BADGE_URL);
      if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
      return;
    }
    await cache.put(BADGE_URL, new Response(String(n)));
    if ('setAppBadge' in navigator) await navigator.setAppBadge(n);
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

async function closeMatchingNotifications(filter) {
  try {
    const notes = await self.registration.getNotifications();
    const alertId = filter?.alertId ? String(filter.alertId) : '';
    const emailId = filter?.emailId ? String(filter.emailId) : '';
    const tag = filter?.tag ? String(filter.tag) : '';
    for (const note of notes) {
      const data = note.data || {};
      if (alertId && String(data.alertId || '') === alertId) {
        note.close();
        continue;
      }
      if (emailId && String(data.emailId || '') === emailId) {
        note.close();
        continue;
      }
      if (tag && String(note.tag || '') === tag) {
        note.close();
      }
    }
  } catch (e) {
    console.warn('[sw] close notifications failed', e);
  }
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

/** Same shapes as formatOtpPushNotification / extractOtpCodeFromPushText. */
function otpCodeFromNotificationText(title, body) {
  const raw = `${body || ''}\n${title || ''}`;
  const google = raw.match(/\b(G-\d{6})\b/i);
  if (google?.[1]) return google[1].toUpperCase();
  const labeled = raw.match(/\bCode[:\s]+([A-Z0-9][A-Z0-9 -]{2,16}[A-Z0-9])\b/i);
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, '');
  return '';
}

function otpCopyPageUrl(code) {
  const trimmed = String(code || '').trim();
  return trimmed ? `/admin/copy#c=${encodeURIComponent(trimmed)}` : '/admin/copy';
}

/** Sign-in (and other non-admin) windows cannot copy — don't treat them as a hit. */
function clientCanCopyOtp(client) {
  try {
    const u = new URL(client.url, self.location.origin);
    if (u.origin !== self.location.origin) return false;
    const path = u.pathname.replace(/\/$/, '') || '/';
    return path === '/admin' || path === '/admin/copy';
  } catch {
    return false;
  }
}

/**
 * Copy the OTP — never open the inbox or a sign-in URL.
 * The SW cannot write the clipboard. The notification tap's user activation
 * only reaches a document opened (or navigated) from this click, so always
 * open /admin/copy first — do not await other work before openWindow.
 */
async function deliverOtpCopy(opts) {
  const code = String(opts.code || '').trim();
  const emailId = opts.emailId ? String(opts.emailId) : '';
  const alertId = opts.alertId ? String(opts.alertId) : '';
  const message = { type: 'reave-otp-copy', code, emailId, alertId };
  const copyUrl = otpCopyPageUrl(code);

  let opened = null;
  if (self.clients.openWindow) {
    try {
      opened = await self.clients.openWindow(copyUrl);
    } catch {
      opened = null;
    }
  }

  if (code) await stashPendingOtpCopy({ code, emailId, alertId });

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if (!clientCanCopyOtp(client)) continue;
    client.postMessage(message);
  }
  if (opened) {
    try {
      opened.postMessage(message);
    } catch {
      /* page copies from the hash / stash on boot */
    }
    return;
  }

  for (const client of clients) {
    if (!clientCanCopyOtp(client) || !('focus' in client)) continue;
    try {
      await client.focus();
      return;
    } catch {
      /* ignore */
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

/** Archive from the OS notification when no admin window is open. */
async function archiveAlertFromSw(alertId) {
  const id = String(alertId || '').trim();
  if (!id) return;
  try {
    const res = await fetch(`/api/admin/alerts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.badgeCount != null) {
        await writeBadgeCount(Math.max(0, Number(data.badgeCount) || 0));
      }
    }
  } catch (e) {
    console.warn('[sw] archive alert failed', e);
  }
}

/**
 * Badge-only sync push after dismissals. iOS requires showNotification for
 * userVisibleOnly subscriptions, but this is not a real alert — update the
 * icon badge, satisfy the push handler, then always close so dismiss/archive
 * does not leave another "pending reviews" banner in the tray.
 */
async function presentBadgeSyncNotification(data, badgeCount) {
  const count = badgeCount != null ? Math.max(0, Number(badgeCount) || 0) : null;
  if (count != null) await writeBadgeCount(count);

  await self.registration.showNotification(data.title || 'Inbox updated', {
    body: data.body || '',
    tag: 'reave-badge-sync',
    silent: true,
    icon: '/api/branding/icon?size=192',
    badge: '/api/branding/icon?size=192',
    data: {
      url: data.url || '/admin?tab=dashboard',
      badgeOnly: true,
      kind: 'badge-sync',
    },
  });

  try {
    const notes = await self.registration.getNotifications({ tag: 'reave-badge-sync' });
    for (const note of notes) note.close();
  } catch {
    /* ignore */
  }

  await notifyClientsInboxPush();
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
  const resolvedOtpCode =
    verificationCode || otpCodeFromNotificationText(data.title, data.body);
  const isBadgeSync =
    data.badgeOnly === true || kind === 'badge-sync' || String(tag) === 'reave-badge-sync';

  if (isBadgeSync) {
    event.waitUntil(presentBadgeSyncNotification(data, badgeCount));
    return;
  }

  let actions = [];
  const customActions = Array.isArray(data.actions)
    ? data.actions.map(String).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  if (customActions.length) {
    const titles = {
      copy: 'Copy code',
      delete: 'Delete',
      archive: 'Archive',
      view: 'View',
      open: 'View',
      activate: 'Activate',
      explain: 'Explain',
      expense: 'Expense',
    };
    // Chromium shows at most ~2 action buttons.
    actions = customActions.slice(0, 2).map((action) => ({
      action: action === 'view' ? 'open' : action,
      title: titles[action] || action,
    }));
  } else if (isOtp && resolvedOtpCode) {
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
        url: isOtp ? otpCopyPageUrl(resolvedOtpCode) : data.url || '/admin?tab=email',
        alertId,
        emailId,
        verificationCode: resolvedOtpCode,
        kind: isOtp ? 'otp' : kind,
      },
      actions,
    }),
    notifyClientsInboxPush(),
  ];
  if (badgeCount != null) tasks.push(writeBadgeCount(badgeCount));
  if (isOtp && resolvedOtpCode) {
    tasks.push(stashPendingOtpCopy({ code: resolvedOtpCode, emailId, alertId, tag }));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'reave-badge-sync') {
    event.waitUntil(writeBadgeCount(Number(event.data.count) || 0));
    return;
  }
  if (event.data?.type === 'reave-close-notifications') {
    event.waitUntil(closeMatchingNotifications(event.data));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteData = event.notification.data || {};
  const alertId = noteData.alertId ? String(noteData.alertId) : '';
  const emailId = noteData.emailId ? String(noteData.emailId) : '';
  const verificationCode = noteData.verificationCode
    ? String(noteData.verificationCode).trim()
    : otpCodeFromNotificationText(event.notification.title, event.notification.body);
  const kind = noteData.kind ? String(noteData.kind) : '';
  const tag = event.notification.tag ? String(event.notification.tag) : '';
  const isOtp =
    kind === 'otp' || tag.toLowerCase().startsWith('otp-') || Boolean(verificationCode);
  const isBadgeSync =
    noteData.badgeOnly === true || kind === 'badge-sync' || tag === 'reave-badge-sync';
  const url = isOtp
    ? otpCopyPageUrl(verificationCode)
    : noteData.url || (isBadgeSync ? '/admin?tab=dashboard' : '/admin?tab=email');
  const absoluteUrl = new URL(url, self.location.origin).href;
  const action = event.action || '';

  if (isBadgeSync) {
    event.waitUntil(
      Promise.all([notifyClientsInboxPush(), openNotificationUrl(absoluteUrl)]),
    );
    return;
  }

  if (isOtp && action !== 'delete') {
    event.waitUntil(
      Promise.all([
        verificationCode
          ? deliverOtpCopy({ code: verificationCode, emailId, alertId })
          : self.clients.openWindow
            ? self.clients.openWindow('/admin/?copy=1')
            : Promise.resolve(),
        notifyClientsInboxPush(),
      ]),
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

  if (action === 'delete' && emailId) {
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
      (async () => {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        if (clients.length) {
          await notifyClientsDismissAlert(alertId);
        } else {
          // No open admin window — dismiss on the server and set the badge here.
          await archiveAlertFromSw(alertId);
        }
        await notifyClientsInboxPush();
      })(),
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
