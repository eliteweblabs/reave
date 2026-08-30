/**
 * Pure Sites health scoring (no I/O) — critical issue list → letter grade.
 */
import { scoreToGrade, type LetterGrade } from './auditReportCard';
import type {
  AnalyticsAccountRow,
  UptimeMonitorForFleetMerge,
} from './analyticsSiteMerge';

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
  checkedAt: number;
  stale?: boolean;
};

export type SiteHealthFleet = {
  checkedAt: number;
  googleConnected: boolean | null;
  siteCount: number;
  criticalSites: number;
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
