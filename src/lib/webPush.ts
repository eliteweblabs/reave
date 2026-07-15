/**
 * Web Push for admin inbox notifications (PWA on /admin).
 */

import webpush from 'web-push';
import { defaultVapidSubjectFromCompany, getCompanyConfig } from './companyConfig';
import { serverEnv } from './serverEnv';
import { listPushSubscriptions, removePushSubscription } from './pushSubscriptionStore';

let _configured = false;
let _configuredSubject: string | null = null;

async function configureWebPush(): Promise<boolean> {
  const publicKey = serverEnv('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = serverEnv('VAPID_PRIVATE_KEY')?.trim();
  const subject =
    serverEnv('VAPID_SUBJECT')?.trim() ||
    defaultVapidSubjectFromCompany(await getCompanyConfig());
  if (!publicKey || !privateKey) return false;
  if (_configured && _configuredSubject === subject) return true;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _configured = true;
  _configuredSubject = subject;
  return true;
}

export function isPushConfigured(): boolean {
  if (serverEnv('PUSH_ENABLED') === '0') return false;
  return Boolean(serverEnv('VAPID_PUBLIC_KEY')?.trim() && serverEnv('VAPID_PRIVATE_KEY')?.trim());
}

export function vapidPublicKey(): string | null {
  return serverEnv('VAPID_PUBLIC_KEY')?.trim() || null;
}

export async function sendPushNotification(payload: {
  title: string;
  body: string;
  tag?: string;
  /** Deep link when the notification is tapped (default /admin?tab=email). */
  url?: string;
}): Promise<void> {
  if (!isPushConfigured() || !(await configureWebPush())) return;

  const subs = await listPushSubscriptions();
  if (!subs.length) return;

  const note = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 240),
    tag: payload.tag ?? 'inbox',
    url: payload.url ?? '/admin?tab=email',
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

/** Push for inbound email alerts (legacy alias). */
export async function sendInboxPushNotification(payload: {
  title: string;
  body: string;
  tag?: string;
  /** Inbox record id — opens that message when the notification is tapped. */
  emailId?: string;
}): Promise<void> {
  const url = payload.emailId
    ? `/admin?tab=email&email=${encodeURIComponent(payload.emailId)}`
    : '/admin?tab=email';
  const { emailId: _emailId, ...rest } = payload;
  return sendPushNotification({ ...rest, url });
}
