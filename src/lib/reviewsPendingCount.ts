/**
 * Pending review count for admin footer + PWA icon badge
 * (same pipeline as dashboard review banners).
 */

import {
  loadDashboardReviewNotifications,
  scheduleHealStaleDashboardReviewSlugs,
} from './dashboardReviewNotifications';

export async function getReviewsPendingCount(): Promise<number> {
  const { notifications, staleSlugs } = await loadDashboardReviewNotifications();
  scheduleHealStaleDashboardReviewSlugs(staleSlugs);
  return notifications.length;
}
