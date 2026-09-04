/**
 * Best-effort wiring for Sites fleet gaps (Plausible, GSC, sitemap submit).
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/wire-fleet-sites.ts
 */
import { getUptimeMonitorsView, syncUptimeMonitorsFromApiIfStale } from '../src/lib/uptimeMonitoring.ts';
import { enrichUptimeMonitorView } from '../src/lib/uptimerobotClient.ts';
import {
  buildAnalyticsDashboardPreview,
  peekCachedAnalyticsDashboardPreview,
} from '../src/lib/analyticsFleet.ts';
import { mergeDashboardSiteCards } from '../src/lib/analyticsSiteMerge.ts';
import { getCompanyConfig } from '../src/lib/companyConfig.ts';
import {
  buildSiteHealthFleet,
  invalidateSiteHealthFleetCache,
} from '../src/lib/siteHealthGrade.ts';
import { wireFleetSites } from '../src/lib/siteWiring.ts';
import { hasFeature } from '../src/lib/features.ts';

async function main() {
  const company = await getCompanyConfig(new Request('https://reave.app/'));
  if (hasFeature('uptime_monitoring')) {
    await syncUptimeMonitorsFromApiIfStale();
  }
  const monitorsView = hasFeature('uptime_monitoring')
    ? await getUptimeMonitorsView()
    : { monitors: [] as Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'] };
  const monitors = monitorsView.monitors.map(enrichUptimeMonitorView);
  let analytics = peekCachedAnalyticsDashboardPreview(company.domain, { allowStale: true });
  if (!analytics && hasFeature('analytic_audit')) {
    analytics = await buildAnalyticsDashboardPreview(company.domain).catch(() => null);
  }
  const cards = mergeDashboardSiteCards(monitors, analytics?.sites ?? []);
  const cardInputs = cards.map((card) => ({
    siteId: card.siteId,
    website: card.analytics?.website ?? null,
    monitor: card.monitor,
    analytics: card.analytics,
  }));

  console.log(`Fleet: ${cardInputs.length} apex site(s)`);
  let siteHealth = await buildSiteHealthFleet(cardInputs, { fresh: true });
  for (const card of cardInputs) {
    const row = siteHealth.sites[card.siteId];
    if (!row) continue;
    const bad = row.readiness?.items.filter((i) => i.status !== 'ok') ?? [];
    if (bad.length) {
      console.log(`\n${card.siteId} — grade ${row.grade ?? '—'} (${row.readiness?.okCount}/${row.readiness?.totalCount} ready)`);
      for (const item of bad) {
        console.log(`  • ${item.label}: ${item.status} — ${item.detail}`);
      }
    }
  }

  const wireResult = await wireFleetSites(cardInputs, siteHealth);
  console.log(`\nWire attempted ${wireResult.attempted}, wired ${wireResult.wired}`);
  if (wireResult.errors.length) {
    for (const err of wireResult.errors) console.warn(`  ! ${err}`);
  }
  for (const row of wireResult.results) {
    console.log(`  ${row.siteId}:`, JSON.stringify(row));
  }

  if (wireResult.wired > 0) {
    invalidateSiteHealthFleetCache();
    siteHealth = await buildSiteHealthFleet(cardInputs, { fresh: true });
    console.log('\nAfter re-scan:');
    for (const card of cardInputs) {
      const row = siteHealth.sites[card.siteId];
      if (!row) continue;
      console.log(`  ${card.siteId}: ${row.grade ?? '—'} (${row.readiness?.okCount}/${row.readiness?.totalCount} ready)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
