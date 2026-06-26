import { serverEnv } from './serverEnv';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

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
};

export type LighthouseAuditResponse =
  | { ok: true; url: string; results: LighthouseStrategyResult[] }
  | { ok: false; error: string; status?: number };

type PsiAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  displayValue?: string;
  details?: { type?: string };
};

type PsiCategory = { score?: number | null };

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
): Promise<LighthouseStrategyResult | { error: string; status?: number }> {
  const apiUrl = new URL(PSI_ENDPOINT);
  apiUrl.searchParams.set('url', url);
  apiUrl.searchParams.set('strategy', strategy);
  for (const cat of categories) {
    apiUrl.searchParams.append('category', cat);
  }

  const apiKey = serverEnv('GOOGLE_PAGESPEED_API_KEY')?.trim();
  if (apiKey) apiUrl.searchParams.set('key', apiKey);

  const res = await fetch(apiUrl.toString(), { headers: { Accept: 'application/json' } });
  const text = await res.text();

  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const err = JSON.parse(text) as { error?: { message?: string } };
      if (err.error?.message) detail = err.error.message;
    } catch {
      /* use raw slice */
    }
    return { error: detail || res.statusText, status: res.status };
  }

  let body: {
    lighthouseResult?: {
      categories?: Record<string, PsiCategory>;
      audits?: Record<string, PsiAudit>;
    };
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
  return {
    strategy,
    scores,
    metrics: pickMetrics(audits),
    opportunities: pickAudits(audits, 'opportunity', 5),
    diagnostics: pickAudits(audits, 'diagnostic', 3),
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
      return { ok: false, error: `${strategy}: ${out.error}`, status: out.status };
    }
    results.push(out);
  }

  return { ok: true, url, results };
}

/** Compact text summary for Telegram tool output. */
export function formatLighthouseResults(data: Extract<LighthouseAuditResponse, { ok: true }>): string {
  const lines: string[] = [`Lighthouse audit: ${data.url}`];
  for (const r of data.results) {
    lines.push(`\n${r.strategy.toUpperCase()}`);
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
