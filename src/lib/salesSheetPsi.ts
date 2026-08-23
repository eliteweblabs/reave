/**
 * PageSpeed Insights mobile results — the Site Speed iPhone exhibit.
 * Layout matches pagespeed.web.dev (no account required to run a URL there).
 */
import { escapeHtml } from './htmlEscape';
import type { LighthouseFieldExperience, LighthouseStrategyResult } from './lighthouseClient';

export type PsiMobileScores = {
  performance?: number;
  accessibility?: number;
  'best-practices'?: number;
  seo?: number;
};

export type PsiMobileMetrics = {
  fcp?: string;
  lcp?: string;
  cls?: string;
  tbt?: string;
  speed_index?: string;
};

export type PsiMobileField = {
  overall?: 'Good' | 'Needs Improvement' | 'Poor';
  lcp?: string;
  inp?: string;
  cls?: string;
};

export type PsiMobileCard = {
  url: string;
  scores: PsiMobileScores;
  metrics: PsiMobileMetrics;
  field?: PsiMobileField;
};

type PsiTone = 'fail' | 'average' | 'pass';

const TONE_HEX: Record<PsiTone, string> = {
  fail: '#ff4e42',
  average: '#ffa400',
  pass: '#0cce6a',
};

const TONE_LABEL: Record<PsiTone, string> = {
  fail: 'Poor',
  average: 'Needs improvement',
  pass: 'Good',
};

function cruxLabel(cat: LighthouseFieldExperience['overall']): PsiMobileField['overall'] | undefined {
  if (cat === 'FAST') return 'Good';
  if (cat === 'AVERAGE') return 'Needs Improvement';
  if (cat === 'SLOW') return 'Poor';
  return undefined;
}

function fieldLcp(ms?: number): string | undefined {
  if (ms == null) return undefined;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fieldInp(ms?: number): string | undefined {
  if (ms == null) return undefined;
  return `${Math.round(ms)} ms`;
}

function fieldCls(raw?: number): string | undefined {
  if (raw == null) return undefined;
  return (raw / 100).toFixed(2);
}

export function psiMobileFromAudit(data: {
  url: string;
  scores: PsiMobileScores;
  metrics: PsiMobileMetrics;
  pageExperience?: LighthouseFieldExperience;
  originExperience?: LighthouseFieldExperience;
}): PsiMobileCard {
  const exp = data.pageExperience || data.originExperience;
  const field: PsiMobileField | undefined = exp
    ? {
        ...(cruxLabel(exp.overall) ? { overall: cruxLabel(exp.overall) } : {}),
        ...(fieldLcp(exp.lcp?.percentile) ? { lcp: fieldLcp(exp.lcp?.percentile) } : {}),
        ...(fieldInp(exp.inp?.percentile) ? { inp: fieldInp(exp.inp?.percentile) } : {}),
        ...(fieldCls(exp.cls?.percentile) ? { cls: fieldCls(exp.cls?.percentile) } : {}),
      }
    : undefined;
  const hasField = field && (field.overall || field.lcp || field.inp || field.cls);
  return {
    url: data.url,
    scores: data.scores,
    metrics: data.metrics,
    ...(hasField ? { field } : {}),
  };
}

export function psiMobileFromStrategy(url: string, mobile: LighthouseStrategyResult): PsiMobileCard {
  return psiMobileFromAudit({
    url,
    scores: mobile.scores,
    metrics: mobile.metrics,
    pageExperience: mobile.pageExperience,
    originExperience: mobile.originExperience,
  });
}

/** Stand-in when PageSpeed has not run (dummy sheet / PSI skip). */
export function dummyPsiMobile(host: string): PsiMobileCard {
  const url = !host || host === 'this site' ? 'https://example.com/' : `https://${host}/`;
  return {
    url,
    scores: { performance: 18, accessibility: 74, 'best-practices': 57, seo: 81 },
    metrics: {
      fcp: '3.8 s',
      lcp: '6.4 s',
      tbt: '890 ms',
      cls: '0.31',
      speed_index: '7.2 s',
    },
  };
}

function scoreTone(score: number | undefined): PsiTone {
  if (score == null) return 'fail';
  if (score >= 90) return 'pass';
  if (score >= 50) return 'average';
  return 'fail';
}

function parseDurationMs(raw: string): number | null {
  const t = raw.replace(/,/g, '').trim();
  const s = t.match(/^([\d.]+)\s*s$/i);
  if (s) return parseFloat(s[1]) * 1000;
  const ms = t.match(/^([\d.]+)\s*ms$/i);
  if (ms) return parseFloat(ms[1]);
  return null;
}

function parseUnitless(raw: string): number | null {
  const m = raw.replace(/,/g, '').trim().match(/^([\d.]+)$/);
  return m ? parseFloat(m[1]) : null;
}

function durationTone(ms: number, good: number, ni: number): PsiTone {
  if (ms <= good) return 'pass';
  if (ms <= ni) return 'average';
  return 'fail';
}

function metricTone(id: 'fcp' | 'lcp' | 'tbt' | 'cls' | 'si', display: string): PsiTone {
  if (id === 'cls') {
    const n = parseUnitless(display);
    if (n == null) return 'fail';
    if (n <= 0.1) return 'pass';
    if (n <= 0.25) return 'average';
    return 'fail';
  }
  const ms = parseDurationMs(display);
  if (ms == null) return 'fail';
  if (id === 'fcp') return durationTone(ms, 1800, 3000);
  if (id === 'lcp') return durationTone(ms, 2500, 4000);
  if (id === 'tbt') return durationTone(ms, 200, 600);
  return durationTone(ms, 3400, 5800);
}

function analyzedHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

function gaugeSvg(score: number | undefined, size: 'lg' | 'sm'): string {
  const value = score == null || Number.isNaN(score) ? null : Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(value ?? 0);
  const color = value == null ? '#9aa0a6' : TONE_HEX[tone];
  const r = 38;
  const c = 2 * Math.PI * r;
  const gap = c * 0.14;
  const track = c - gap;
  const fill = value == null ? 0 : (value / 100) * track;
  const label = value == null ? '—' : String(value);
  const font = size === 'lg' ? 28 : 22;
  return `<svg class="ss-psi-gauge ss-psi-gauge--${size}" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="#e8eaed" stroke-width="10" stroke-linecap="round"
    stroke-dasharray="${track.toFixed(2)} ${gap.toFixed(2)}" transform="rotate(115 50 50)"/>
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
    stroke-dasharray="${fill.toFixed(2)} ${(c - fill).toFixed(2)}" transform="rotate(115 50 50)"/>
  <text x="50" y="58" text-anchor="middle" fill="${color}" font-size="${font}" font-weight="500">${label}</text>
</svg>`;
}

const PSI_ICON =
  '<svg class="ss-psi-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1a73e8"/><path d="M12 6.2a5.8 5.8 0 1 1-4.3 9.7" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="1.35" fill="#fff"/><path d="M12 12 16.1 8.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';

const LAB_ROWS: Array<{ id: 'fcp' | 'lcp' | 'tbt' | 'cls' | 'si'; key: keyof PsiMobileMetrics; label: string }> = [
  { id: 'fcp', key: 'fcp', label: 'First Contentful Paint' },
  { id: 'lcp', key: 'lcp', label: 'Largest Contentful Paint' },
  { id: 'tbt', key: 'tbt', label: 'Total Blocking Time' },
  { id: 'cls', key: 'cls', label: 'Cumulative Layout Shift' },
  { id: 'si', key: 'speed_index', label: 'Speed Index' },
];

function metricRow(label: string, value: string, tone: PsiTone): string {
  return `<div class="ss-psi-row">
  <span class="ss-psi-row-name">${escapeHtml(label)}</span>
  <span class="ss-psi-row-val" style="color:${TONE_HEX[tone]}">${escapeHtml(value)}</span>
  <span class="ss-psi-pill" style="background:${TONE_HEX[tone]}">${TONE_LABEL[tone]}</span>
</div>`;
}

export function renderPsiMobileHtml(card: PsiMobileCard): string {
  const host = analyzedHost(card.url);
  const perf = card.scores.performance;
  const cats: Array<{ key: keyof PsiMobileScores; label: string }> = [
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'best-practices', label: 'Best Practices' },
    { key: 'seo', label: 'SEO' },
  ];
  const catHtml = cats
    .map(
      (cat) => `<div class="ss-psi-cat">
  ${gaugeSvg(card.scores[cat.key], 'sm')}
  <span>${escapeHtml(cat.label)}</span>
</div>`,
    )
    .join('');

  const field = card.field;
  const hasField = Boolean(field && (field.lcp || field.inp || field.cls));
  const fieldHtml = hasField
    ? `<section class="ss-psi-block">
  <p class="ss-psi-h">Discover what your real users are experiencing</p>
  ${field?.overall ? `<p class="ss-psi-cwv">Core Web Vitals Assessment: <strong>${escapeHtml(field.overall)}</strong></p>` : ''}
  ${field?.lcp ? metricRow('Largest Contentful Paint', field.lcp, metricTone('lcp', field.lcp)) : ''}
  ${field?.inp ? metricRow('Interaction to Next Paint', field.inp, durationTone(parseDurationMs(field.inp) ?? 9999, 200, 500)) : ''}
  ${field?.cls ? metricRow('Cumulative Layout Shift', field.cls, metricTone('cls', field.cls)) : ''}
</section>`
    : '';

  const labRows = LAB_ROWS.filter((row) => card.metrics[row.key])
    .map((row) => {
      const value = card.metrics[row.key] || '';
      return metricRow(row.label, value, metricTone(row.id, value));
    })
    .join('');

  return `<div class="ss-phone-body ss-psi">
  <header class="ss-psi-brand">${PSI_ICON}<span>PageSpeed Insights</span></header>
  <p class="ss-psi-url">${escapeHtml(host)}</p>
  <div class="ss-psi-tabs" aria-hidden="true"><span class="is-on">Mobile</span><span>Desktop</span></div>
  <div class="ss-psi-perf">
    ${gaugeSvg(perf, 'lg')}
    <span>Performance</span>
  </div>
  <div class="ss-psi-cats">${catHtml}</div>
  ${
    hasField
      ? fieldHtml
      : `<section class="ss-psi-block">
    <p class="ss-psi-h">Diagnose performance issues</p>
    ${labRows}
  </section>`
  }
</div>`;
}
