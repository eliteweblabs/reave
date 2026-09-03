/**
 * Website readiness checklist — dashboard tiles + Sites detail report.
 *
 * Maps lightweight fleet probes (seo_inventory, GSC, uptime, Plausible) and
 * optional deep probes (PageSpeed, link crawl) into a consistent checklist that
 * mirrors the website-audit playbook priorities.
 */
import type { AnalyticsAccountRow, UptimeMonitorForFleetMerge } from './analyticsSiteMerge';
import type { SeoInventoryResponse } from './seoInventoryClient';
import type { SiteHealthIssue } from './siteHealthScore';

export type SiteReadinessStatus = 'ok' | 'warn' | 'crit' | 'unknown' | 'pending';

export type SiteReadinessItem = {
  id: string;
  label: string;
  status: SiteReadinessStatus;
  detail: string;
  effort: string;
  impact: 'High' | 'Medium' | 'Low';
};

export type SiteReadinessSummary = {
  items: SiteReadinessItem[];
  okCount: number;
  totalCount: number;
  checkedAt: number;
};

/** Canonical checklist shown on dashboard tiles and Sites detail. */
export const SITE_READINESS_DEFINITIONS: Array<{
  id: string;
  label: string;
  effort: string;
  impact: 'High' | 'Medium' | 'Low';
}> = [
  {
    id: 'schema_markup',
    label: 'Review Schema Markup (testimonials)',
    effort: '1 hour',
    impact: 'Medium',
  },
  {
    id: 'page_speed',
    label: 'Page Speed Optimization',
    effort: '2–4 hours',
    impact: 'Medium',
  },
  {
    id: 'search_console',
    label: 'Google Search Console Setup',
    effort: '30 min',
    impact: 'High',
  },
  {
    id: 'xml_sitemap',
    label: 'XML Sitemap Submission',
    effort: '30 min',
    impact: 'High',
  },
  {
    id: 'internal_linking',
    label: 'Internal Linking (service pages)',
    effort: 'Complete',
    impact: 'High',
  },
  {
    id: 'analytics',
    label: 'Analytics & Engagement',
    effort: '30 min',
    impact: 'High',
  },
  {
    id: 'uptime',
    label: 'Site uptime',
    effort: '—',
    impact: 'High',
  },
];

export type PageSpeedProbe = {
  performanceScore: number | null;
  fieldCategory?: string | null;
  detail: string;
};

export type LinkCrawlProbe = {
  broken: number;
  internal: number;
  detail: string;
};

function hasReviewSchema(types: string[]): boolean {
  return types.some((t) =>
    /review|aggregaterating|rating|testimonial|localbusiness|organization|restaurant|store|medicalbusiness|professionalservice|attorney|dentist|realestateagent/i.test(
      t,
    ),
  );
}

function schemaStatus(
  seo: Extract<SeoInventoryResponse, { ok: true }> | null,
): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (!seo) return { status: 'unknown', detail: 'Not scanned yet' };
  const types = seo.structured_data.types;
  if (!types.length) {
    return { status: 'crit', detail: 'No JSON-LD structured data on homepage' };
  }
  if (hasReviewSchema(types)) {
    const reviewish = types.filter((t) => /review|aggregaterating|rating|testimonial/i.test(t));
    return {
      status: 'ok',
      detail: reviewish.length
        ? `Review/rating schema present (${reviewish.slice(0, 3).join(', ')})`
        : `Business schema present (${types.slice(0, 4).join(', ')})`,
    };
  }
  return {
    status: 'warn',
    detail: `Schema present but no Review/LocalBusiness markup (${types.slice(0, 4).join(', ')})`,
  };
}

function pageSpeedStatus(probe: PageSpeedProbe | null | undefined): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (!probe) return { status: 'unknown', detail: 'Not verified — open site for PageSpeed scan' };
  const score = probe.performanceScore;
  const field = probe.fieldCategory?.toUpperCase();
  if (field === 'FAST') return { status: 'ok', detail: probe.detail || 'Real-user experience: Fast' };
  if (field === 'AVERAGE') return { status: 'warn', detail: probe.detail || 'Real-user experience: Average' };
  if (field === 'SLOW') return { status: 'crit', detail: probe.detail || 'Real-user experience: Slow' };
  if (score == null) return { status: 'unknown', detail: probe.detail || 'PageSpeed scan unavailable' };
  if (score >= 80) return { status: 'ok', detail: probe.detail || `Performance score ${score}` };
  if (score >= 50) return { status: 'warn', detail: probe.detail || `Performance score ${score} — room to optimize` };
  return { status: 'crit', detail: probe.detail || `Performance score ${score} — needs work` };
}

function searchConsoleStatus(input: {
  googleConnected: boolean | null;
  gscHasProperty: boolean | null;
  issues: SiteHealthIssue[];
}): Pick<SiteReadinessItem, 'status' | 'detail'> {
  const codes = new Set(input.issues.map((i) => i.code));
  if (codes.has('gsc_missing')) {
    return { status: 'crit', detail: 'Domain not added to Search Console' };
  }
  if (input.googleConnected === false || codes.has('gsc_unconnected')) {
    return { status: 'warn', detail: 'Connect Google in Sites to manage Search Console' };
  }
  if (input.gscHasProperty === true) {
    return { status: 'ok', detail: 'Property in Search Console' };
  }
  if (input.googleConnected === true) {
    return { status: 'unknown', detail: 'Checking Search Console…' };
  }
  return { status: 'unknown', detail: 'Search Console status pending' };
}

function sitemapStatus(
  seo: Extract<SeoInventoryResponse, { ok: true }> | null,
  gscSitemapCount: number | null,
  googleConnected: boolean | null,
): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (!seo) return { status: 'unknown', detail: 'Not scanned yet' };
  if (!seo.sitemap.present) {
    return { status: 'crit', detail: 'No XML sitemap found at common paths' };
  }
  const base = seo.sitemap.url_count_estimate != null
    ? `Sitemap at ${seo.sitemap.url} (~${seo.sitemap.url_count_estimate} URLs)`
    : `Sitemap at ${seo.sitemap.url}`;
  if (googleConnected === true && gscSitemapCount != null) {
    if (gscSitemapCount > 0) {
      return { status: 'ok', detail: `${base} · ${gscSitemapCount} submitted in Search Console` };
    }
    return { status: 'warn', detail: `${base} · not submitted in Search Console yet` };
  }
  return { status: 'ok', detail: base };
}

function internalLinkingStatus(
  seo: Extract<SeoInventoryResponse, { ok: true }> | null,
  linkProbe: LinkCrawlProbe | null | undefined,
): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (linkProbe) {
    if (linkProbe.broken > 0) {
      return {
        status: 'crit',
        detail: `${linkProbe.broken} broken link(s) across ${linkProbe.internal} internal URLs`,
      };
    }
    if (linkProbe.internal >= 8) {
      return { status: 'ok', detail: linkProbe.detail || `${linkProbe.internal} internal pages crawled — no broken links` };
    }
    return {
      status: 'warn',
      detail: linkProbe.detail || `Only ${linkProbe.internal} internal pages — add service page cross-links`,
    };
  }
  if (!seo?.internal_links) {
    return { status: 'unknown', detail: 'Homepage link scan pending' };
  }
  const { total, serviceLike, samplePaths } = seo.internal_links;
  if (total < 3) {
    return { status: 'warn', detail: `Only ${total} internal links on homepage — thin navigation` };
  }
  if (serviceLike >= 2 || total >= 8) {
    const sample = samplePaths.length ? ` (${samplePaths.slice(0, 3).join(', ')})` : '';
    return {
      status: 'ok',
      detail: `${total} internal links on homepage${serviceLike ? ` · ${serviceLike} service-style paths` : ''}${sample}`,
    };
  }
  return {
    status: 'warn',
    detail: `${total} internal links — add links between service pages`,
  };
}

function analyticsStatus(analytics: AnalyticsAccountRow | null | undefined): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (!analytics) return { status: 'unknown', detail: 'Analytics account not listed' };
  if (analytics.registered) {
    const visitors = analytics.visitors != null ? `${analytics.visitors} visitors / 30d` : 'wired';
    return { status: 'ok', detail: `Plausible/GA4 ${visitors}` };
  }
  return { status: 'warn', detail: 'Analytics not wired — visitors won’t show on dashboard' };
}

function uptimeStatus(monitor: UptimeMonitorForFleetMerge | null | undefined): Pick<SiteReadinessItem, 'status' | 'detail'> {
  if (!monitor) return { status: 'unknown', detail: 'No uptime monitor' };
  const down =
    monitor.is_offline === true ||
    monitor.is_down === true ||
    Number(monitor.status) === 8 ||
    Number(monitor.status) === 9;
  if (down) return { status: 'crit', detail: 'Site reported down by uptime monitor' };
  if (monitor.is_paused) return { status: 'warn', detail: 'Uptime monitor paused' };
  const ratio = monitor.uptime_ratio_7d;
  if (ratio != null && ratio < 99) {
    return { status: 'warn', detail: `${ratio.toFixed(1)}% uptime (7d)` };
  }
  return {
    status: 'ok',
    detail: ratio != null ? `${ratio.toFixed(1)}% uptime (7d)` : 'Monitor active',
  };
}

export function buildSiteReadinessChecklist(input: {
  seo: Extract<SeoInventoryResponse, { ok: true }> | null;
  issues: SiteHealthIssue[];
  googleConnected: boolean | null;
  gscHasProperty: boolean | null;
  gscSitemapCount: number | null;
  analytics?: AnalyticsAccountRow | null;
  monitor?: UptimeMonitorForFleetMerge | null;
  pageSpeed?: PageSpeedProbe | null;
  linkCrawl?: LinkCrawlProbe | null;
  checkedAt?: number;
}): SiteReadinessSummary {
  const statusById: Record<string, Pick<SiteReadinessItem, 'status' | 'detail'>> = {
    schema_markup: schemaStatus(input.seo),
    page_speed: pageSpeedStatus(input.pageSpeed),
    search_console: searchConsoleStatus({
      googleConnected: input.googleConnected,
      gscHasProperty: input.gscHasProperty,
      issues: input.issues,
    }),
    xml_sitemap: sitemapStatus(input.seo, input.gscSitemapCount, input.googleConnected),
    internal_linking: internalLinkingStatus(input.seo, input.linkCrawl),
    analytics: analyticsStatus(input.analytics),
    uptime: uptimeStatus(input.monitor),
  };

  const items: SiteReadinessItem[] = SITE_READINESS_DEFINITIONS.map((def) => {
    const row = statusById[def.id] ?? { status: 'unknown' as const, detail: 'Pending' };
    return {
      id: def.id,
      label: def.label,
      status: row.status,
      detail: row.detail,
      effort: def.effort,
      impact: def.impact,
    };
  });

  const okCount = items.filter((i) => i.status === 'ok').length;
  return {
    items,
    okCount,
    totalCount: items.length,
    checkedAt: input.checkedAt ?? Date.now(),
  };
}

export function readinessStatusLabel(status: SiteReadinessStatus): string {
  switch (status) {
    case 'ok':
      return 'Likely Good';
    case 'warn':
      return 'Needs Attention';
    case 'crit':
      return 'Not Started';
    case 'pending':
      return 'Scanning…';
    default:
      return 'Not Verified';
  }
}
