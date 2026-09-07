/**
 * Scan → auto-wire → PageSpeed → re-scan for the whole Sites fleet.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/improve-fleet-scores.ts
 */
import { getUptimeMonitorsView, syncUptimeMonitorsFromApiIfStale } from '../src/lib/uptimeMonitoring.ts';
import { enrichUptimeMonitorView } from '../src/lib/uptimerobotClient.ts';
import {
  buildAnalyticsDashboardPreview,
  peekCachedAnalyticsDashboardPreview,
} from '../src/lib/analyticsFleet.ts';
import { mergeDashboardSiteCards } from '../src/lib/analyticsSiteMerge.ts';
import { getCompanyConfig } from '../src/lib/companyConfig.ts';
import { improveFleetScores, fleetCardsFromMonitorsAndAnalytics } from '../src/lib/fleetScoreFix.ts';
import { loadSiteFleetIgnoreState } from '../src/lib/siteFleetIgnore.ts';
import { hasFeature } from '../src/lib/features.ts';

async function loadCards(companyDomain: string) {
  if (hasFeature('uptime_monitoring')) {
    await syncUptimeMonitorsFromApiIfStale();
  }
  const monitorsView = hasFeature('uptime_monitoring')
    ? await getUptimeMonitorsView()
    : { monitors: [] as Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'] };
  const monitors = monitorsView.monitors.map(enrichUptimeMonitorView);
  let analytics = peekCachedAnalyticsDashboardPreview(companyDomain, { allowStale: true });
  if (!analytics && hasFeature('analytic_audit')) {
    analytics = await buildAnalyticsDashboardPreview(companyDomain).catch(() => null);
  }
  return fleetCardsFromMonitorsAndAnalytics(monitors, analytics?.sites ?? []);
}

async function main() {
  const company = await getCompanyConfig(new Request('https://reave.app/'));
  const ignore = await loadSiteFleetIgnoreState();
  const cards = await loadCards(company.domain);

  console.log(`Improving scores for ${cards.length} site(s)…\n`);

  const { siteHealth, wireResult, report } = await improveFleetScores({
    cards,
    ignore,
    companyDomain: company.domain,
    includePageSpeed: true,
    reloadCards: () => loadCards(company.domain),
  });

  console.log(report.summary);
  console.log(`Wired: ${wireResult.wired} · PageSpeed probes: ${report.pageSpeedProbed}\n`);

  for (const site of report.sites.sort((a, b) => (a.grade || 'Z').localeCompare(b.grade || 'Z'))) {
    if (site.fixed.length) {
      console.log(`${site.siteId} — ${site.grade ?? '—'} (${site.okCount}/${site.totalCount})`);
      console.log(`  fixed: ${site.fixed.join(', ')}`);
    }
  }

  console.log('\nRemaining gaps:');
  for (const site of report.sites) {
    if (!site.remaining.length) continue;
    console.log(`\n${site.siteId} — grade ${site.grade ?? '—'} (${site.okCount}/${site.totalCount})`);
    for (const item of site.remaining) {
      const tag = item.autoFixable ? 'auto' : 'manual';
      console.log(`  [${tag}] ${item.label}: ${item.detail}`);
    }
  }

  const grades = Object.values(siteHealth.sites).map((row) => row.grade).filter(Boolean);
  console.log(`\nFleet grades: ${grades.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
