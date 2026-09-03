/**
 * GET /api/admin/sites/readiness — per-site website readiness checklist.
 *
 * Query:
 *   site_id — apex domain (required)
 *   full=1 — run PageSpeed + link crawl (slower; detail view)
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import { hasFeature } from '../../../../lib/features';
import { getUptimeMonitorsView, syncUptimeMonitorsFromApiIfStale } from '../../../../lib/uptimeMonitoring';
import { enrichUptimeMonitorView } from '../../../../lib/uptimerobotClient';
import {
  buildAnalyticsDashboardPreview,
  peekCachedAnalyticsDashboardPreview,
} from '../../../../lib/analyticsFleet';
import { mergeDashboardSiteCards } from '../../../../lib/analyticsSiteMerge';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  buildSiteHealthFleet,
  hydrateSiteHealthFleetCache,
  peekCachedSiteHealthFleet,
} from '../../../../lib/siteHealthGrade';
import {
  buildSiteReadinessChecklist,
  readinessStatusLabel,
  type SiteReadinessSummary,
} from '../../../../lib/siteReadinessChecklist';
import { seoInventory } from '../../../../lib/seoInventoryClient';
import { checkLinks } from '../../../../lib/checkLinksClient';
import { lighthousePsiMobile } from '../../../../lib/lighthouseClient';
import { hostnameFromWebsite } from '../../../../lib/plausibleClient';
import { normalizeMonitorHost } from '../../../../lib/publicUrl';
import { collectInstantSiteHealthIssues } from '../../../../lib/siteHealthScore';

export const prerender = false;

const PSI_CACHE_TTL_MS = 24 * 60 * 60_000;
const psiCache = new Map<string, { at: number; probe: Parameters<typeof buildSiteReadinessChecklist>[0]['pageSpeed'] }>();

async function loadSiteCard(context: APIContext, siteId: string) {
  const company = await getCompanyConfig(context.request);
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
  const host = hostnameFromWebsite(siteId) || normalizeMonitorHost(siteId) || siteId;
  return cards.find((c) => c.siteId === host) ?? null;
}

async function cachedPageSpeedProbe(url: string, fresh: boolean) {
  const key = url.replace(/\/+$/, '').toLowerCase();
  const cached = psiCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < PSI_CACHE_TTL_MS) {
    return cached.probe ?? null;
  }
  const res = await lighthousePsiMobile(url);
  if (!res.ok) {
    const probe = { performanceScore: null, fieldCategory: null, detail: res.error };
    psiCache.set(key, { at: Date.now(), probe });
    return probe;
  }
  const score = res.scores.performance != null ? Math.round(res.scores.performance * 100) : null;
  const field = res.pageExperience?.overall || res.originExperience?.overall || null;
  const detailParts: string[] = [];
  if (field) detailParts.push(`Field data: ${field}`);
  if (score != null) detailParts.push(`Lab mobile score ${score}`);
  if (res.metrics.lcp) detailParts.push(`LCP ${res.metrics.lcp}`);
  const probe = {
    performanceScore: score,
    fieldCategory: field,
    detail: detailParts.join(' · ') || 'PageSpeed scan complete',
  };
  psiCache.set(key, { at: Date.now(), probe });
  return probe;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('uptime_monitoring')) {
    return jsonResponse({ ok: false, error: 'Sites module is not enabled' }, 404);
  }

  const url = new URL(context.request.url);
  const siteId = (url.searchParams.get('site_id') || '').trim();
  if (!siteId) {
    return jsonResponse({ ok: false, error: 'site_id is required' }, 400);
  }

  const full = url.searchParams.get('full') === '1' || url.searchParams.get('full') === 'true';
  const fresh = url.searchParams.get('fresh') === '1';

  await hydrateSiteHealthFleetCache();
  let fleet = peekCachedSiteHealthFleet({ allowStale: true });
  const host = hostnameFromWebsite(siteId) || normalizeMonitorHost(siteId) || siteId;
  let cachedRow = fleet?.sites?.[host];

  if (!cachedRow || fresh) {
    const card = await loadSiteCard(context, host);
    if (card) {
      fleet = await buildSiteHealthFleet(
        [
          {
            siteId: card.siteId,
            website: card.analytics?.website ?? null,
            monitor: card.monitor,
            analytics: card.analytics,
          },
        ],
        { fresh: true },
      );
      cachedRow = fleet.sites[host];
    }
  }

  let readiness: SiteReadinessSummary | null = cachedRow?.readiness ?? null;
  const card = await loadSiteCard(context, host);

  if (full && card) {
    const siteUrl = `https://${host.replace(/^www\./, '')}/`;
    const [seoResult, pageSpeed, linkResult] = await Promise.all([
      seoInventory(siteUrl),
      cachedPageSpeedProbe(siteUrl, fresh),
      checkLinks(siteUrl, true),
    ]);
    const seo = seoResult.ok ? seoResult : null;
    const linkCrawl =
      linkResult.ok
        ? {
            broken: linkResult.summary.broken,
            internal: linkResult.summary.internal,
            detail: `${linkResult.pages_crawled} pages crawled · ${linkResult.summary.internal} internal links`,
          }
        : null;

    const robots = seo
      ? { present: seo.robots_txt.present, blocksAll: seo.robots_txt.blocks_all }
      : null;
    const gscHasProperty =
      fleet?.googleConnected && cachedRow?.issues
        ? !cachedRow.issues.some((i) => i.code === 'gsc_missing')
        : null;
    const issues = collectInstantSiteHealthIssues({
      monitor: card.monitor,
      analytics: card.analytics,
      googleConnected: fleet?.googleConnected ?? null,
      gscHasProperty: fleet?.googleConnected ? gscHasProperty : null,
      robots,
    });
    const xmlItem = cachedRow?.readiness?.items.find((i) => i.id === 'xml_sitemap');
    const gscSitemapCount =
      xmlItem?.detail.includes('submitted in Search Console') ? 1 : null;

    readiness = buildSiteReadinessChecklist({
      seo,
      issues,
      googleConnected: fleet?.googleConnected ?? null,
      gscHasProperty: fleet?.googleConnected ? gscHasProperty : null,
      gscSitemapCount,
      analytics: card.analytics,
      monitor: card.monitor,
      pageSpeed,
      linkCrawl,
    });
  }

  if (!readiness) {
    return jsonResponse({ ok: false, error: 'Site not found in fleet' }, 404);
  }

  return jsonResponse({
    ok: true,
    siteId: host,
    readiness,
    labels: readiness.items.reduce(
      (acc, item) => {
        acc[item.id] = readinessStatusLabel(item.status);
        return acc;
      },
      {} as Record<string, string>,
    ),
    full,
    checkedAt: readiness.checkedAt,
  });
}
