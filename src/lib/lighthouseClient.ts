import { fetchWithDeadline, isAbortError, isAgentTimeoutError } from './agentWatchdog';
import { serverEnv } from './serverEnv';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * PageSpeed Insights renders the target page in a real browser on Google's
 * side, so it is slow by nature and occasionally never answers at all. One
 * strategy gets 60s; the caller runs at most two.
 */
const PSI_TIMEOUT_MS = 60_000;

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
const STRATEGIES = ['mobile', 'desktop'] as const;

export type LighthouseCategory = (typeof CATEGORIES)[number];
export type LighthouseStrategy = (typeof STRATEGIES)[number];

export type LighthouseAuditSummary = {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
};

export type CruxCategory = 'FAST' | 'AVERAGE' | 'SLOW';

export type LighthouseFieldMetric = {
  percentile: number;
  category: CruxCategory;
};

/** Chrome UX Report (real-user) experience from PageSpeed Insights. */
export type LighthouseFieldExperience = {
  overall?: CruxCategory;
  lcp?: LighthouseFieldMetric;
  inp?: LighthouseFieldMetric;
  cls?: LighthouseFieldMetric;
  fcp?: LighthouseFieldMetric;
};

export type LighthouseStrategyResult = {
  strategy: LighthouseStrategy;
  scores: Partial<Record<LighthouseCategory, number>>;
  metrics: {
    fcp?: string;
    lcp?: string;
    cls?: string;
    tbt?: string;
    speed_index?: string;
  };
  opportunities: LighthouseAuditSummary[];
  diagnostics: LighthouseAuditSummary[];
  /** Real-user experience for this URL (CrUX). */
  pageExperience?: LighthouseFieldExperience;
  /** Origin-level CrUX when the URL itself has too little traffic. */
  originExperience?: LighthouseFieldExperience;
  /** Lighthouse `network-requests` table (PageSpeed / DevTools waterfall). */
  networkRequests?: LighthouseNetworkRequest[];
};

export type LighthouseAuditResponse =
  | { ok: true; url: string; results: LighthouseStrategyResult[] }
  | { ok: false; error: string; status?: number; rateLimited?: boolean };

export type LighthouseNetworkRequest = {
  url: string;
  startMs: number;
  endMs: number;
  transferSize: number;
  resourceType: string;
  statusCode?: number;
};

type PsiNetworkItem = {
  url?: string;
  startTime?: number;
  endTime?: number;
  networkRequestTime?: number;
  networkEndTime?: number;
  rendererStartTime?: number;
  transferSize?: number;
  resourceType?: string;
  statusCode?: number;
};

type PsiAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  displayValue?: string;
  details?: { type?: string; items?: PsiNetworkItem[] };
};

type PsiCategory = { score?: number | null };

type PsiCruxMetric = {
  percentile?: number;
  category?: string;
};

type PsiLoadingExperience = {
  overall_category?: string;
  metrics?: Record<string, PsiCruxMetric>;
};

function asCruxCategory(raw: string | undefined): CruxCategory | undefined {
  const v = (raw || '').toUpperCase();
  if (v === 'FAST' || v === 'AVERAGE' || v === 'SLOW') return v;
  return undefined;
}

function pickFieldMetric(
  metrics: Record<string, PsiCruxMetric> | undefined,
  keys: string[],
): LighthouseFieldMetric | undefined {
  if (!metrics) return undefined;
  for (const key of keys) {
    const m = metrics[key];
    if (!m || m.percentile == null || Number.isNaN(m.percentile)) continue;
    const category = asCruxCategory(m.category);
    if (!category) continue;
    return { percentile: m.percentile, category };
  }
  return undefined;
}

function pickFieldExperience(
  le: PsiLoadingExperience | undefined,
): LighthouseFieldExperience | undefined {
  if (!le) return undefined;
  const overall = asCruxCategory(le.overall_category);
  const metrics = le.metrics;
  const lcp = pickFieldMetric(metrics, ['LARGEST_CONTENTFUL_PAINT_MS']);
  const inp = pickFieldMetric(metrics, [
    'INTERACTION_TO_NEXT_PAINT',
    'EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT',
  ]);
  const cls = pickFieldMetric(metrics, ['CUMULATIVE_LAYOUT_SHIFT_SCORE']);
  const fcp = pickFieldMetric(metrics, ['FIRST_CONTENTFUL_PAINT_MS']);
  const out: LighthouseFieldExperience = {
    ...(overall ? { overall } : {}),
    ...(lcp ? { lcp } : {}),
    ...(inp ? { inp } : {}),
    ...(cls ? { cls } : {}),
    ...(fcp ? { fcp } : {}),
  };
  if (!out.overall && !out.lcp && !out.inp && !out.cls && !out.fcp) return undefined;
  return out;
}

function formatCruxOverall(cat: CruxCategory): string {
  if (cat === 'FAST') return 'Good';
  if (cat === 'AVERAGE') return 'Needs Improvement';
  return 'Poor';
}

function formatFieldMetricLine(exp: LighthouseFieldExperience): string | null {
  const parts: string[] = [];
  if (exp.lcp) parts.push(`LCP ${(exp.lcp.percentile / 1000).toFixed(1)} s (${formatCruxOverall(exp.lcp.category)})`);
  if (exp.inp) parts.push(`INP ${Math.round(exp.inp.percentile)} ms (${formatCruxOverall(exp.inp.category)})`);
  if (exp.cls) parts.push(`CLS ${(exp.cls.percentile / 100).toFixed(2)} (${formatCruxOverall(exp.cls.category)})`);
  return parts.length ? parts.join(' · ') : null;
}

function formatFieldExperience(exp: LighthouseFieldExperience | undefined, label: string): string[] {
  if (!exp) return [];
  const overall = exp.overall ? formatCruxOverall(exp.overall) : 'N/A';
  const lines = [`${label} — ${overall}`];
  const metrics = formatFieldMetricLine(exp);
  if (metrics) lines.push(`  ${metrics}`);
  return lines;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function scorePct(score: number | null | undefined): number | undefined {
  if (score == null || Number.isNaN(score)) return undefined;
  return Math.round(score * 100);
}

function pickMetrics(audits: Record<string, PsiAudit>): LighthouseStrategyResult['metrics'] {
  const get = (id: string) => audits[id]?.displayValue;
  return {
    fcp: get('first-contentful-paint'),
    lcp: get('largest-contentful-paint'),
    cls: get('cumulative-layout-shift'),
    tbt: get('total-blocking-time'),
    speed_index: get('speed-index'),
  };
}

function num(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return raw;
}

export function pickNetworkRequests(
  audits: Record<string, PsiAudit | undefined>,
): LighthouseNetworkRequest[] {
  const items = audits['network-requests']?.details?.items;
  if (!Array.isArray(items) || !items.length) return [];
  const rows: LighthouseNetworkRequest[] = [];
  for (const item of items) {
    const url = (item.url || '').trim();
    if (!url || url.startsWith('data:')) continue;
    const start =
      num(item.networkRequestTime) ?? num(item.startTime) ?? num(item.rendererStartTime) ?? 0;
    const end = num(item.networkEndTime) ?? num(item.endTime) ?? start + 40;
    rows.push({
      url,
      startMs: Math.max(0, start),
      endMs: Math.max(Math.max(0, start) + 8, end),
      transferSize: Math.max(0, num(item.transferSize) ?? 0),
      resourceType: (item.resourceType || 'Other').trim() || 'Other',
      ...(item.statusCode != null ? { statusCode: item.statusCode } : {}),
    });
  }
  return rows.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function pickAudits(
  audits: Record<string, PsiAudit>,
  kind: 'opportunity' | 'diagnostic',
  limit: number,
): LighthouseAuditSummary[] {
  const rows: LighthouseAuditSummary[] = [];
  for (const audit of Object.values(audits)) {
    if (!audit?.id || !audit.title) continue;
    const detailsType = audit.details?.type;
    const isOpp = detailsType === 'opportunity';
    const isDiag = detailsType === 'table' || detailsType === 'debugdata' || detailsType === 'filmstrip';
    if (kind === 'opportunity' && !isOpp) continue;
    if (kind === 'diagnostic' && !isDiag) continue;
    if (kind === 'opportunity' && audit.score === 1) continue;
    rows.push({
      id: audit.id,
      title: audit.title,
      score: audit.score ?? null,
      ...(audit.displayValue ? { displayValue: audit.displayValue } : {}),
    });
  }
  rows.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
  return rows.slice(0, limit);
}

async function runOne(
  url: string,
  strategy: LighthouseStrategy,
  categories: LighthouseCategory[],
): Promise<LighthouseStrategyResult | { error: string; status?: number; rateLimited?: boolean }> {
  const apiUrl = new URL(PSI_ENDPOINT);
  apiUrl.searchParams.set('url', url);
  apiUrl.searchParams.set('strategy', strategy);
  for (const cat of categories) {
    apiUrl.searchParams.append('category', cat);
  }

  const apiKey = serverEnv('GOOGLE_PAGESPEED_API_KEY')?.trim();
  if (apiKey) apiUrl.searchParams.set('key', apiKey);

  let res: Response;
  try {
    res = await fetchWithDeadline(apiUrl.toString(), {
      headers: { Accept: 'application/json' },
      timeoutMs: PSI_TIMEOUT_MS,
    });
  } catch (e) {
    const reason =
      isAbortError(e) || isAgentTimeoutError(e)
        ? `PageSpeed Insights did not respond within ${PSI_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
    return { error: reason };
  }
  const text = await res.text();

  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const err = JSON.parse(text) as { error?: { message?: string } };
      if (err.error?.message) detail = err.error.message;
    } catch {
      /* use raw slice */
    }
    const rateLimited =
      res.status === 429 ||
      /quota exceeded|rate limit|too many requests|daily limit/i.test(detail);
    console.warn('[lighthouse] PSI request failed', {
      status: res.status,
      rateLimited,
      hasApiKey: Boolean(apiKey),
      strategy,
      url,
      detail: detail.slice(0, 120),
    });
    return { error: detail || res.statusText, status: res.status, rateLimited };
  }

  let body: {
    lighthouseResult?: {
      categories?: Record<string, PsiCategory>;
      audits?: Record<string, PsiAudit>;
    };
    loadingExperience?: PsiLoadingExperience;
    originLoadingExperience?: PsiLoadingExperience;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'Invalid JSON from PageSpeed Insights' };
  }

  const lr = body.lighthouseResult;
  if (!lr?.categories) return { error: 'Missing lighthouse categories in PSI response' };

  const scores: Partial<Record<LighthouseCategory, number>> = {};
  for (const cat of categories) {
    const key = cat === 'best-practices' ? 'best-practices' : cat;
    const s = scorePct(lr.categories[key]?.score);
    if (s != null) scores[cat] = s;
  }

  const audits = lr.audits ?? {};
  const pageExperience = pickFieldExperience(body.loadingExperience);
  const originExperience = pickFieldExperience(body.originLoadingExperience);
  const networkRequests = pickNetworkRequests(audits);
  return {
    strategy,
    scores,
    metrics: pickMetrics(audits),
    opportunities: pickAudits(audits, 'opportunity', 5),
    diagnostics: pickAudits(audits, 'diagnostic', 3),
    ...(pageExperience ? { pageExperience } : {}),
    ...(originExperience ? { originExperience } : {}),
    ...(networkRequests.length ? { networkRequests } : {}),
  };
}

/** Mobile performance-only PSI run — enough for the sales-sheet network waterfall. */
export async function lighthouseNetworkWaterfall(url: string): Promise<
  | { ok: true; url: string; lcp?: string; requests: LighthouseNetworkRequest[] }
  | { ok: false; error: string }
> {
  const res = await lighthouseAudit({ url, category: 'performance', strategy: 'mobile' });
  if (!res.ok) return { ok: false, error: res.error };
  const mobile = res.results[0];
  return {
    ok: true,
    url: res.url,
    ...(mobile?.metrics.lcp ? { lcp: mobile.metrics.lcp } : {}),
    requests: mobile?.networkRequests ?? [],
  };
}

/** Run Google PageSpeed Insights (Lighthouse) for one or both strategies. */
export async function lighthouseAudit(opts: {
  url: string;
  category?: LighthouseCategory;
  strategy?: LighthouseStrategy | 'both';
}): Promise<LighthouseAuditResponse> {
  const url = normalizeUrl(opts.url);
  if (!url) return { ok: false, error: 'Invalid URL (http/https required)' };

  const categories: LighthouseCategory[] = opts.category ? [opts.category] : [...CATEGORIES];

  let strategies: LighthouseStrategy[];
  if (opts.strategy === 'mobile' || opts.strategy === 'desktop') {
    strategies = [opts.strategy];
  } else {
    strategies = ['mobile', 'desktop'];
  }

  const results: LighthouseStrategyResult[] = [];
  for (const strategy of strategies) {
    const out = await runOne(url, strategy, categories);
    if ('error' in out) {
      return {
        ok: false,
        error: `${strategy}: ${out.error}`,
        status: out.status,
        rateLimited: out.rateLimited,
      };
    }
    results.push(out);
  }

  return { ok: true, url, results };
}

/** Compact text summary for tool output. */
export function formatLighthouseResults(data: Extract<LighthouseAuditResponse, { ok: true }>): string {
  const lines: string[] = [`Lighthouse audit: ${data.url}`];
  const fieldSource = data.results.find((r) => r.pageExperience || r.originExperience);
  if (fieldSource) {
    lines.push(
      '',
      'Real-user experience (Chrome UX Report) — this is what visitors actually get.',
      'Lab mobile is a throttled stress test (even nytimes.com / reddit.com often score Poor there). Prefer field data for the verdict.',
    );
    lines.push(...formatFieldExperience(fieldSource.pageExperience, 'Field data (this URL)'));
    lines.push(...formatFieldExperience(fieldSource.originExperience, 'Field data (origin)'));
  } else {
    lines.push(
      '',
      'No Chrome UX Report field data for this URL (common on low-traffic sites).',
      'Lab mobile is a throttled stress test — report mobile AND desktop and do not treat a typical lab-mobile Poor as a failing site.',
    );
  }
  for (const r of data.results) {
    lines.push(`\n${r.strategy.toUpperCase()} (lab)`);
    const scoreParts = Object.entries(r.scores).map(([k, v]) => `${k}: ${v}`);
    if (scoreParts.length) lines.push(`Scores — ${scoreParts.join(', ')}`);
    const m = r.metrics;
    const metricParts = [
      m.fcp && `FCP ${m.fcp}`,
      m.lcp && `LCP ${m.lcp}`,
      m.cls && `CLS ${m.cls}`,
      m.tbt && `TBT ${m.tbt}`,
    ].filter(Boolean);
    if (metricParts.length) lines.push(`Metrics — ${metricParts.join(' · ')}`);
    if (r.opportunities.length) {
      lines.push('Top opportunities:');
      for (const o of r.opportunities) {
        lines.push(`  • ${o.title}${o.displayValue ? ` (${o.displayValue})` : ''}`);
      }
    }
  }
  return lines.join('\n');
}
