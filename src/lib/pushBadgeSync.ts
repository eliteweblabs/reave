/**
 * Push an absolute reviews-pending count to admin PWA icon badges after
 * dashboard notifications go away (dismiss / archive / delete / triage).
 *
 * Debounced so bulk dismissals coalesce into one quiet badge-sync push.
 * The service worker treats these as badge-only (show then immediate close)
 * so owners are not notified again for a count refresh.
 */

import { cachedCompanyBrandName } from './companyConfig';
import { getReviewsPendingCount } from './reviewsPendingCount';
import { sendPushNotification } from './webPush';

const DEBOUNCE_MS = 400;

let _timer: ReturnType<typeof setTimeout> | null = null;
let _inflight: Promise<void> | null = null;

async function flushReviewsBadgePush(): Promise<void> {
  const badgeCount = await getReviewsPendingCount().catch(() => null);
  if (badgeCount == null) return;

  const brand = cachedCompanyBrandName() || 'Admin';
  const title =
    badgeCount > 0
      ? `${badgeCount} pending review${badgeCount === 1 ? '' : 's'}`
      : 'All caught up';
  const body =
    badgeCount > 0 ? `${brand} dashboard count updated` : `No reviews waiting in ${brand}`;

  await sendPushNotification({
    title,
    body,
    tag: 'reave-badge-sync',
    url: '/admin?tab=dashboard',
    badgeCount,
    skipDashboardAlert: true,
    /** Badge sync should still reach the phone during sleep mode. */
    bypassQuietHours: true,
    badgeOnly: true,
  }).catch((e) => {
    console.warn('[push] badge sync failed', e);
  });
}

/** Coalesce rapid dismissals into a single badge-sync push. */
export function scheduleReviewsBadgePush(): void {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    _inflight = (_inflight ?? Promise.resolve())
      .then(() => flushReviewsBadgePush())
      .catch(() => undefined)
      .then(() => {
        _inflight = null;
      });
  }, DEBOUNCE_MS);
}

/** Immediate badge sync (tests / callers that already coalesced work). */
export async function pushReviewsBadgeCount(): Promise<void> {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  await flushReviewsBadgePush();
}
