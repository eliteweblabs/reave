/**
 * Web Push for admin inbox notifications (PWA on /admin).
 */

import webpush from 'web-push';
import { defaultVapidSubjectFromCompany, getCompanyConfig } from './companyConfig';
import { canonicalizeReaveBrandEmail } from './reavePublicEmail';
import { getReviewsPendingCount } from './reviewsPendingCount';
import { formatNotificationPayload, formatPwaPushTitle } from './notificationFormat';
import { inferPushAlertKind, storeEnsurePushAlert, type PushAlertKind } from './pushAlertStore';
import { isReusablePushAlertTag, pushPresentationIds } from './pushNotificationIdentity';
import { serverEnv } from './serverEnv';
import { listPushSubscriptions, removePushSubscription } from './pushSubscriptionStore';
import { isPushQuietHoursActive } from './pushQuietHours';

let _configured = false;
let _configuredSubject: string | null = null;

const recentPushAt = new Map<string, number>();
const RECENT_PUSH_MS = 120_000;

function claimRecentPushSend(tag: string, collapseId: string, verificationCode: string): boolean {
  const ids = pushPresentationIds({ tag, collapseId, verificationCode });
  if (!ids.length) return true;
  const now = Date.now();
  if (ids.some((id) => now - (recentPushAt.get(id) || 0) < RECENT_PUSH_MS)) return false;
  for (const id of ids) recentPushAt.set(id, now);
  return true;
}

async function configureWebPush(): Promise<boolean> {
  const publicKey = serverEnv('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = serverEnv('VAPID_PRIVATE_KEY')?.trim();
  const subject = canonicalizeReaveBrandEmail(
    serverEnv('VAPID_SUBJECT')?.trim() ||
      defaultVapidSubjectFromCompany(await getCompanyConfig()),
  );
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
  /** Absolute pending-review count for the PWA icon badge (defaults to live server count). */
  badgeCount?: number;
  /** When true, skip creating a dismissible dashboard alert (default false). */
  skipDashboardAlert?: boolean;
  /** When true, skip phone/PWA push (dashboard alert only). */
  skipPhonePush?: boolean;
  /** When true, deliver even during sleep mode / quiet hours. */
  bypassQuietHours?: boolean;
  /** Client reply and other high-priority alerts — may still deliver if allowUrgentDuringSleep. */
  urgent?: boolean;
  kind?: PushAlertKind;
  /**
   * Badge-only sync after dismissals — service worker updates the icon badge and
   * closes the required userVisibleOnly notification immediately (no tray spam).
   */
  badgeOnly?: boolean;
  /** Inbox row id — used by the service worker for OTP delete / deep links. */
  emailId?: string;
  /** OTP digits — service worker copies these on notification tap. */
  verificationCode?: string;
  /** Stable OS-tray id — Message-ID / Resend id / OTP code, not the inbox UUID. */
  collapseId?: string;
  /** Optional action button ids (view, archive, delete, copy, …). */
  actions?: string[];
}): Promise<void> {
  const badgeOnly = Boolean(payload.badgeOnly);
  const tag = payload.tag ?? (badgeOnly ? 'reave-badge-sync' : 'inbox');
  const url = payload.url ?? (badgeOnly ? '/admin?tab=dashboard' : '/admin?tab=email');
  const formatted = formatNotificationPayload(payload.title, payload.body);
  const company = badgeOnly ? null : await getCompanyConfig().catch(() => null);
  // Phone banner only — dashboard cards already live inside the PWA chrome.
  const pushTitle = badgeOnly
    ? formatted.title
    : formatPwaPushTitle(company?.name || '', formatted.title);
  const pushBody = formatted.detail;
  const emailId = payload.emailId?.trim() || '';
  const verificationCode = payload.verificationCode?.trim() || '';
  const collapseId = payload.collapseId?.trim() || '';
  const kind = badgeOnly ? 'badge-sync' : (payload.kind ?? inferPushAlertKind(tag, url));
  const actions = Array.isArray(payload.actions)
    ? payload.actions.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  const quiet = await isPushQuietHoursActive({
    bypassQuietHours: payload.bypassQuietHours,
    urgent: payload.urgent,
  });

  let alertId: string | undefined;
  let createdDashboardAlert = true;
  if (!payload.skipDashboardAlert && !badgeOnly) {
    const ensured = await storeEnsurePushAlert({
      tag,
      kind: kind === 'badge-sync' ? 'system' : kind,
      title: formatted.title,
      detail: pushBody,
      url,
      actions,
    }).catch(() => null);
    alertId = ensured?.alert.id;
    createdDashboardAlert = ensured?.created ?? true;
  }

  if (payload.skipPhonePush || quiet) return;
  if (!createdDashboardAlert && isReusablePushAlertTag(tag)) {
    console.info('[push] skipped duplicate phone push', { tag, collapseId });
    return;
  }
  if (!claimRecentPushSend(tag, collapseId, verificationCode)) {
    console.info('[push] skipped duplicate in-flight phone push', { tag, collapseId });
    return;
  }

  if (!isPushConfigured() || !(await configureWebPush())) return;

  const subs = await listPushSubscriptions();
  if (!subs.length) return;

  const badgeCount =
    payload.badgeCount != null
      ? Math.max(0, Number(payload.badgeCount) || 0)
      : await getReviewsPendingCount().catch(() => undefined);

  const note = JSON.stringify({
    title: pushTitle,
    body: pushBody,
    tag,
    timestamp: Date.now(),
    url,
    kind,
    ...(badgeOnly ? { badgeOnly: true } : {}),
    ...(alertId ? { alertId } : {}),
    ...(emailId ? { emailId } : {}),
    ...(verificationCode ? { verificationCode } : {}),
    ...(collapseId ? { collapseId } : {}),
    ...(actions.length ? { actions } : {}),
    ...(badgeCount != null ? { badgeCount } : {}),
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
  /** OTP digits — copied when the push notification is tapped. */
  verificationCode?: string;
  /** Stable OS-tray id shared across duplicate ingest of the same email. */
  collapseId?: string;
  urgent?: boolean;
  kind?: PushAlertKind;
  /** When true, phone push only — no second dashboard banner. */
  skipDashboardAlert?: boolean;
  /** When true, dashboard only — no phone push. */
  skipPhonePush?: boolean;
  actions?: string[];
}): Promise<void> {
  const url = payload.verificationCode
    ? '/admin/?copy=1'
    : payload.emailId
      ? `/admin?tab=email&email=${encodeURIComponent(payload.emailId)}`
      : '/admin?tab=email';
  const {
    kind,
    skipDashboardAlert,
    skipPhonePush,
    emailId,
    verificationCode,
    collapseId,
    actions,
    ...rest
  } = payload;
  return sendPushNotification({
    ...rest,
    url,
    kind,
    skipDashboardAlert,
    skipPhonePush,
    emailId,
    verificationCode,
    collapseId,
    actions,
  });
}
