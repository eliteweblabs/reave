/**
 * Reviews-pending badge sync after dashboard notifications go away
 * (dismiss / archive / delete / triage).
 *
 * We intentionally do **not** send a Web Push for count-only updates.
 * iOS requires `showNotification` for `userVisibleOnly` subscriptions, so a
 * "badge sync" push still lands in Notification Center as
 * "N pending reviews / brand dashboard count updated" — even when the service
 * worker closes it immediately. Real inbox/alert pushes already carry
 * `badgeCount`, and the open admin PWA updates the icon badge via
 * `postMessage({ type: 'reave-badge-sync' })`.
 */

/** No-op: count-only push notifications are disabled (see file comment). */
export function scheduleReviewsBadgePush(): void {
  /* intentionally empty */
}

/** No-op: count-only push notifications are disabled (see file comment). */
export async function pushReviewsBadgeCount(): Promise<void> {
  /* intentionally empty */
}
