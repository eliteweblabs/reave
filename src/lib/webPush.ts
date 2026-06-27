/**
 * Web Push for admin inbox notifications (PWA on /admin).
 */

import webpush from 'web-push';
import { serverEnv } from './serverEnv';
import { listPushSubscriptions, removePushSubscription } from './pushSubscriptionStore';

let _configured = false;

function configureWebPush(): boolean {
  if (_configured) return true;
  const publicKey = serverEnv('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = serverEnv('VAPID_PRIVATE_KEY')?.trim();
  const subject = serverEnv('VAPID_SUBJECT')?.trim() || 'mailto:thomas@reave.app';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  if (serverEnv('PUSH_ENABLED') === '0') return false;
  return Boolean(serverEnv('VAPID_PUBLIC_KEY')?.trim() && serverEnv('VAPID_PRIVATE_KEY')?.trim());
}

export function vapidPublicKey(): string | null {
  return serverEnv('VAPID_PUBLIC_KEY')?.trim() || null;
}

export async function sendInboxPushNotification(payload: {
  title: string;
  body: string;
  tag?: string;
}): Promise<void> {
  if (!isPushConfigured() || !configureWebPush()) return;

  const subs = await listPushSubscriptions();
  if (!subs.length) return;

  const note = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 240),
    tag: payload.tag ?? 'inbox',
    url: '/admin?tab=email',
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          note,
        );
      } catch (e) {
        const status = e && typeof e === 'object' && 'statusCode' in e ? Number(e.statusCode) : 0;
        if (status === 404 || status === 410) {
          await removePushSubscription(sub.id).catch(() => undefined);
        }
        console.warn('[push] send failed', status || e);
      }
    }),
  );
}
