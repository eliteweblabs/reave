/**
 * Pure Sites health scoring (no I/O) — critical issue list → letter grade.
 */
import { scoreToGrade, type LetterGrade } from './auditReportCard';
import type {
  AnalyticsAccountRow,
  UptimeMonitorForFleetMerge,
} from './analyticsSiteMerge';

import type {
  SiteReadinessItem,
  SiteReadinessStatus,
  SiteReadinessSummary,
} from './siteReadinessChecklist';

export type SiteHealthIssueCode =
  | 'down'
  | 'robots_blocked'
  | 'robots_missing'
  | 'plausible_unregistered'
  | 'gsc_missing'
  | 'gsc_unconnected';

export type SiteHealthIssue = {
  code: SiteHealthIssueCode;
  severity: 'critical' | 'warn';
  label: string;
};

export type SiteHealthSummary = {
  grade: LetterGrade | null;
  score: number | null;
  criticalCount: number;
  issues: SiteHealthIssue[];
  readiness?: SiteReadinessSummary | null;
  checkedAt: number;
  stale?: boolean;
  /** Dashboard-only: excluded from Site issues count and agent fix runs. */
  ignored?: boolean;
  ignoreReason?: string;
  /** Homepage / robots probe — true when noindex or robots.txt blocks all. */
  searchEnginesBlocked?: boolean | null;
  /** Reave Connect responded on last scan (WordPress indexing toggle). */
  wpConnectAvailable?: boolean | null;
};

export type SiteHealthFleet = {
  checkedAt: number;
  googleConnected: boolean | null;
  siteCount: number;
  criticalSites: number;
  /** Count of sites flagged ignore (legal hold / do not touch). */
  ignoredSites?: number;
  sites: Record<string, SiteHealthSummary>;
};

const ISSUE_PENALTY: Record<SiteHealthIssueCode, number> = {
  down: 55,
  robots_blocked: 40,
  robots_missing: 10,
  gsc_missing: 18,
  gsc_unconnected: 8,
  plausible_unregistered: 15,
};

/** Pure: turn issue list into score / letter grade. */
export function scoreSiteHealthIssues(issues: SiteHealthIssue[]): {
  grade: LetterGrade | null;
  score: number;
  criticalCount: number;
} {
  let score = 100;
  for (const issue of issues) {
    score -= ISSUE_PENALTY[issue.code] ?? 0;
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    grade: scoreToGrade(score),
    criticalCount: issues.filter((i) => i.severity === 'critical').length,
  };
}

const READINESS_POINTS: Record<SiteReadinessStatus, number> = {
  ok: 100,
  warn: 62,
  crit: 12,
  unknown: 42,
  pending: 42,
};

/**
 * Dashboard letter grade from the full readiness checklist.
 * A is reserved for a perfect run — every item must be green (ok).
 */
const SEO_READINESS_IDS = new Set(['schema_markup', 'xml_sitemap', 'internal_linking']);
const SEO_ISSUE_CODES = new Set<SiteHealthIssueCode>(['robots_blocked', 'robots_missing']);

function isArchivalReadinessItem(item: SiteReadinessItem | null | undefined): boolean {
  if (!item) return false;
  if (item.status !== 'unknown') return true;
  const detail = String(item.detail || '').trim().toLowerCase();
  return detail.length > 0 && !detail.startsWith('not scanned') && !detail.startsWith('pending');
}

/** Keep last good checklist rows when a fresh probe comes back empty. */
export function mergeSiteReadinessSummary(
  previous: SiteReadinessSummary | null | undefined,
  next: SiteReadinessSummary,
  opts: { seoProbed?: boolean } = {},
): SiteReadinessSummary {
  if (!previous?.items?.length) return next;
  const seoProbed = opts.seoProbed === true;
  const prevById = new Map(previous.items.map((item) => [item.id, item]));
  const items = next.items.map((item) => {
    const prev = prevById.get(item.id);
    if (!prev || !isArchivalReadinessItem(prev)) return item;
    if (item.status !== 'unknown') return item;
    if (!seoProbed && SEO_READINESS_IDS.has(item.id)) return prev;
    if (isArchivalReadinessItem(prev)) return prev;
    return item;
  });
  const okCount = items.filter((i) => i.status === 'ok').length;
  return {
    items,
    okCount,
    totalCount: items.length,
    checkedAt: next.checkedAt,
  };
}

/** Merge a fresh site row onto the last persisted scan without downgrading to “not scanned”. */
export function mergeSiteHealthSummary(
  previous: SiteHealthSummary | null | undefined,
  next: SiteHealthSummary,
  opts: { seoProbed?: boolean } = {},
): SiteHealthSummary {
  if (!previous) return next;
  const seoProbed = opts.seoProbed === true;
  const readiness = mergeSiteReadinessSummary(previous.readiness, next.readiness ?? {
    items: [],
    okCount: 0,
    totalCount: 0,
    checkedAt: next.checkedAt,
  }, { seoProbed });
  const scored = scoreSiteHealthFromReadiness(readiness);

  let issues = next.issues;
  if (!seoProbed && previous.issues?.length) {
    const liveCodes = new Set(
      next.issues.filter((issue) => !SEO_ISSUE_CODES.has(issue.code)).map((issue) => issue.code),
    );
    const merged = [
      ...next.issues.filter((issue) => !SEO_ISSUE_CODES.has(issue.code)),
      ...previous.issues.filter((issue) => SEO_ISSUE_CODES.has(issue.code) && !liveCodes.has(issue.code)),
    ];
    issues = merged.length ? merged : previous.issues;
  }

  return {
    grade: scored.grade,
    score: scored.score,
    criticalCount: scored.criticalCount,
    issues,
    readiness,
    checkedAt: next.checkedAt,
    searchEnginesBlocked: seoProbed
      ? next.searchEnginesBlocked
      : (next.searchEnginesBlocked ?? previous.searchEnginesBlocked),
    wpConnectAvailable: next.wpConnectAvailable ?? previous.wpConnectAvailable,
    stale: next.stale,
    ignored: next.ignored ?? previous.ignored,
    ignoreReason: next.ignoreReason ?? previous.ignoreReason,
  };
}

export function scoreSiteHealthFromReadiness(readiness: SiteReadinessSummary): {
  grade: LetterGrade | null;
  score: number;
  criticalCount: number;
} {
  const items = readiness.items;
  if (!items.length) {
    return { grade: null, score: 0, criticalCount: 0 };
  }

  const criticalCount = items.filter((i) => i.status === 'crit').length;
  if (items.every((i) => i.status === 'ok')) {
    return { grade: 'A', score: 100, criticalCount: 0 };
  }

  const score = Math.round(
    items.reduce((sum, item) => sum + (READINESS_POINTS[item.status] ?? 42), 0) / items.length,
  );
  let grade = scoreToGrade(score);
  if (grade === 'A') grade = 'B';

  return { grade, score, criticalCount };
}

export function collectInstantSiteHealthIssues(input: {
  monitor?: UptimeMonitorForFleetMerge | null;
  analytics?: AnalyticsAccountRow | null;
  googleConnected: boolean | null;
  gscHasProperty: boolean | null;
  robots?: { present: boolean; blocksAll: boolean } | null;
}): SiteHealthIssue[] {
  const issues: SiteHealthIssue[] = [];
  const monitor = input.monitor;
  const down =
    monitor?.is_offline === true ||
    monitor?.is_down === true ||
    Number(monitor?.status) === 8 ||
    Number(monitor?.status) === 9;
  if (down) {
    issues.push({ code: 'down', severity: 'critical', label: 'Site down' });
  }

  if (input.robots) {
    if (input.robots.blocksAll) {
      issues.push({
        code: 'robots_blocked',
        severity: 'critical',
        label: 'robots.txt blocks crawlers',
      });
    } else if (!input.robots.present) {
      issues.push({
        code: 'robots_missing',
        severity: 'warn',
        label: 'No robots.txt',
      });
    }
  }

  if (input.googleConnected === false) {
    issues.push({
      code: 'gsc_unconnected',
      severity: 'warn',
      label: 'Search Console not connected',
    });
  } else if (input.googleConnected === true && input.gscHasProperty === false) {
    issues.push({
      code: 'gsc_missing',
      severity: 'critical',
      label: 'Not in Search Console',
    });
  }

  if (input.analytics && input.analytics.registered !== true) {
    issues.push({
      code: 'plausible_unregistered',
      severity: 'warn',
      label: 'Analytics not wired',
    });
  }

  const severityRank = (s: SiteHealthIssue['severity']) => (s === 'critical' ? 0 : 1);
  issues.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
  return issues;
}
