/**
 * Backfill dismissible dashboard alerts from recent uptime incidents
 * (covers alerts that were pushed before the push-alert store existed).
 */

import { hasFeature } from './features';
import { dbUptimeSummary } from './pgUptime';
import { isUptimeDbConfigured } from './pgUptime';
import { storeCreatePushAlert, storeFindPushAlertByTag } from './pushAlertStore';
import { isUptimeAlertSuppressed } from './uptimeMonitoring';
import { uptimeStatusIsDown } from './uptimerobotClient';

export async function syncRecentUptimeIncidentsToPushAlerts(): Promise<void> {
  if (!hasFeature('uptime_monitoring') || !isUptimeDbConfigured()) return;

  const summary = await dbUptimeSummary();
  if (!summary?.recent_incidents?.length) return;

  const cutoffMs = Date.now() - 14 * 86_400_000;

  for (const inc of summary.recent_incidents) {
    if (new Date(inc.created_at).getTime() < cutoffMs) continue;
    if (isUptimeAlertSuppressed(inc.monitor_id, inc.monitor_name)) continue;

    const tag = `uptime-incident-${inc.id}`;
    const existing = await storeFindPushAlertByTag(tag);
    if (existing) continue;

    const label = inc.monitor_name || `Monitor ${inc.monitor_id}`;
    const down =
      String(inc.alert_type || '').toLowerCase().includes('down') ||
      (inc.status_after != null && uptimeStatusIsDown(inc.status_after));

    await storeCreatePushAlert({
      tag,
      kind: 'uptime',
      title: down ? `DOWN: ${label}` : `UP: ${label}`,
      detail: (inc.message || (down ? 'Site is down' : 'Site recovered')).slice(0, 240),
      url: '/admin?tab=home',
      createdAt: inc.created_at,
    }).catch(() => undefined);
  }
}
