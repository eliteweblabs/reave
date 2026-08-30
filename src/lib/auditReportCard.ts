/**
 * Parse website-audit markdown (playbook body) into a client-facing report card.
 * Does not re-run audits — filters existing Work job body for the portal UI.
 *
 * Admin keeps the raw markdown. This module only shapes the client diagnostic:
 * plain-language findings, scores, and sources — no jargon dump.
 */

import { ensureGooglePlacesNotListedInAuditBody } from './auditPlacesListing';
import { siteSpeedResearchProblem } from './salesSheetResearch';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Diagnostic categories shown to clients (mockup 13 + monetizable extras).
 * `best_practices` / `presence` remain parseable from older markdown but are
 * folded into security / social for the client view.
 * `google_business` / `apple_business` fold into `local_listings`.
 */
export type ReportCardCategoryId =
  | 'domain_reputation'
  | 'security'
  | 'domain'
  | 'local_listings'
  | 'seo'
  | 'performance'
  | 'mobile'
  | 'reviews'
  | 'social'
  | 'analytics'
  | 'accessibility'
  | 'broken_links'
  | 'content'
  | 'lead_capture'
  | 'schema'
  | 'email'
  /** @deprecated folded into security — kept for older markdown / LH scores */
  | 'best_practices'
  /** @deprecated folded into social — kept for older markdown */
  | 'presence'
  /** @deprecated folded into local_listings */
  | 'google_business'
  /** @deprecated folded into local_listings */
  | 'apple_business'
  /** @deprecated removed — no client tile; hosting company stays under DNS notes */
  | 'hosting';

export type ReportCardIcon =
  | 'radar'
  | 'shield'
  | 'globe'
  | 'pin'
  | 'compass'
  | 'search'
  | 'speed'
  | 'mobile'
  | 'star'
  | 'share'
  | 'chart'
  | 'access'
  | 'cloud'
  | 'link'
  | 'content'
  | 'lead'
  | 'schema'
  | 'mail';

export interface ReportCardCategory {
  id: ReportCardCategoryId;
  label: string;
  icon: ReportCardIcon;
  /** Short plain-language finding for the card body. */
  summary: string;
  /** Same as summary — preferred name in the diagnostic UI. */
  finding: string;
  grade: LetterGrade | null;
  /** Extra plain-language detail (optional expand). */
  why: string[];
  /** Optional 0–100 score when derived from Lighthouse / similar. */
  score?: number | null;
  /** Independent data source attribution (client-facing). */
  source: string;
  /** Highlight as the KEY TRUST SIGNAL card. */
  featured?: boolean;
  /** true when the audit could not evaluate this category. */
  unavailable?: boolean;
}

/** Client-facing service opportunity: problem → solution. */
export interface ReportCardIdea {
  id: string;
  categoryId: ReportCardCategoryId | 'general';
  categoryLabel: string;
  problem: string;
  solution: string;
  /** Lower = show first (weaker grades / clearer opportunities). */
  priority: number;
}

export interface AuditReportCard {
  isAudit: boolean;
  /** Stub “in progress” Siri project — show waiting state, not grades. */
  inProgress: boolean;
  title: string;
  website?: string;
  /** One-line client headline under the overall score. */
  headline?: string;
  /** Short critical-stat pills for the hero. */
  heroStats?: Array<{ label: string; tone: 'crit' | 'risk' | 'info' }>;
  overall: LetterGrade | null;
  /** Featured trust-signal category (Domain & IP Reputation when available). */
  featured?: ReportCardCategory | null;
  categories: ReportCardCategory[];
  /** Promoted service opportunities (problem → solution). */
  ideas: ReportCardIdea[];
  /** Checkbox action items from the audit body. */
  actionItems: string[];
  /** Suggested letter after recommended work (optimistic, for graphics). */
  potential: LetterGrade | null;
  /** 0–100 fill for the overall ring. */
  overallScore: number | null;
  potentialScore: number | null;
  /** How many graded systems landed on F. */
  criticalCount?: number;
}

const AUDIT_TAG_RE = /^(siri-audit|quick-audit|full-audit)$/i;
const AUDIT_HEADING_RE =
  /(?:website|online presence|ssl|seo|lighthouse).{0,40}audit|siri audit in progress/i;

type CategoryMeta = {
  id: ReportCardCategoryId;
  label: string;
  icon: ReportCardIcon;
  source: string;
  /** Show as the featured KEY TRUST SIGNAL when graded. */
  featured?: boolean;
};

/** Client-facing category catalog (order ≈ mockup, then monetizable extras). */
const CATEGORY_META: CategoryMeta[] = [
  {
    id: 'domain_reputation',
    label: 'Domain & IP Reputation',
    icon: 'radar',
    source: 'Google Safe Browsing · spam blocklists · network reputation',
    featured: true,
  },
  {
    id: 'security',
    label: 'SSL & Website Security',
    icon: 'shield',
    source: 'TLS certificate inspection · security headers (HSTS, CSP, X-Frame-Options)',
  },
  {
    id: 'domain',
    label: 'Domain & DNS Health',
    icon: 'globe',
    source: 'Public DNS resolvers (Google · Cloudflare) · WHOIS registration',
  },
  {
    id: 'local_listings',
    label: 'Maps & Directories',
    icon: 'pin',
    source: 'Brave Search · Google Places API · Google Business · Apple Maps · Yelp · Bing Places',
  },
  {
    id: 'seo',
    label: 'SEO Fundamentals',
    icon: 'search',
    source:
      'SEO inventory scan · Open Graph · robots.txt · XML sitemap · Google Lighthouse SEO',
  },
  {
    id: 'performance',
    label: 'Site Speed & Performance',
    icon: 'speed',
    source: 'Google PageSpeed Insights (Lighthouse) · Core Web Vitals',
  },
  {
    id: 'mobile',
    label: 'Mobile Responsiveness',
    icon: 'mobile',
    source: 'Playwright (headless Chromium) · real-browser mobile layout',
  },
  {
    id: 'reviews',
    label: 'Reviews & Reputation',
    icon: 'star',
    source: 'Brave Search · Google · Yelp · major review sites',
  },
  {
    id: 'social',
    label: 'Social Spread',
    icon: 'share',
    source: 'Brave Search · social profiles · local directories',
  },
  {
    id: 'analytics',
    label: 'Analytics & Conversion Tracking',
    icon: 'chart',
    source: 'Tech stack detection · Google Analytics / Tag Manager patterns',
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    icon: 'access',
    source: 'Google Lighthouse · WCAG accessibility checks',
  },
  {
    id: 'broken_links',
    label: 'Broken Links & Crawl Health',
    icon: 'link',
    source: 'Automated site crawl · link status checker',
  },
  {
    id: 'content',
    label: 'Content & Messaging',
    icon: 'content',
    source: 'Homepage HTML fetch · page content review',
  },
  {
    id: 'lead_capture',
    label: 'Lead Capture',
    icon: 'lead',
    source: 'Playwright form checks · homepage contact path review',
  },
  {
    id: 'schema',
    label: 'Search Rich Results',
    icon: 'schema',
    source: 'JSON-LD structured data scan · LocalBusiness markup',
  },
  {
    id: 'email',
    label: 'Email Deliverability',
    icon: 'mail',
    source: 'DNS email auth · SPF · DKIM · DMARC',
  },
];

const CATEGORY_BY_ID = new Map(CATEGORY_META.map((c) => [c.id, c]));

/** Tools shown on /digital-audit and the report-card footer. */
export const AUDIT_SCAN_STACK = [
  { name: 'Google Lighthouse', role: 'Speed, SEO & accessibility' },
  { name: 'Playwright', role: 'Real-browser UX' },
  { name: 'SSL & DNS', role: 'Certificates & email auth' },
  { name: 'Tech stack detection', role: 'CMS, analytics & tags' },
  { name: 'Maps & directories', role: 'Google, Apple, Yelp' },
  { name: 'Link crawl', role: 'Broken links & redirects' },
] as const;

export const AUDIT_GRADE_LEGEND = [
  { grade: 'A', range: '90–100' },
  { grade: 'B', range: '80–89' },
  { grade: 'C', range: '70–79' },
  { grade: 'D', range: '60–69' },
  { grade: 'F', range: 'Below 60' },
] as const;

/** Client-facing hedge on portal audits and the sales one-pager. */
export const AUDIT_REPORT_DISCLAIMER =
  'Grades and findings are compiled from independent measurement tools as of the scan date above — not the subjective opinion of the firm presenting this report.';

const GRADE_SCORE: Record<LetterGrade, number> = {
  A: 95,
  B: 85,
  C: 72,
  D: 62,
  F: 40,
};

const GRADE_RANK: Record<LetterGrade, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
};

export function scoreToGrade(score: number | null | undefined): LetterGrade | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Lighthouse lab performance uses a much harsher curve than academic 90/80/70.
 * Google's own bands are Good 90+, Needs Improvement 50–89, Poor 0–49 — and
 * even nytimes.com / reddit.com routinely land in the 20s–40s on *mobile lab*.
 * Mapping that to F made every audit look like a failing site.
 */
export function labPerformanceToGrade(score: number | null | undefined): LetterGrade | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 45) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

export function gradeToScore(grade: LetterGrade | null | undefined): number | null {
  if (!grade) return null;
  return GRADE_SCORE[grade];
}

export function averageGrade(grades: Array<LetterGrade | null | undefined>): LetterGrade | null {
  const nums = grades
    .map((g) => (g ? GRADE_SCORE[g] : null))
    .filter((n): n is number => n != null);
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return scoreToGrade(avg);
}

function worseGrade(
  a: LetterGrade | null | undefined,
  b: LetterGrade | null | undefined,
): LetterGrade | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

/**
 * Keep letter grade and 0–100 score in lockstep for the client UI.
 * Numeric scores win; letter-only categories get a representative mid-band score.
 */
export function alignScoreAndGrade(
  score: number | null | undefined,
  grade: LetterGrade | null | undefined,
): { score: number | null; grade: LetterGrade | null } {
  if (score != null && !Number.isNaN(score)) {
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    return { score: clamped, grade: scoreToGrade(clamped) };
  }
  if (grade) return { score: gradeToScore(grade), grade };
  return { score: null, grade: null };
}

function finalizeCategory(cat: ReportCardCategory): ReportCardCategory {
  if (cat.id === 'performance' && cat.score != null && !Number.isNaN(cat.score)) {
    const clamped = Math.max(0, Math.min(100, Math.round(cat.score)));
    return { ...cat, score: clamped, grade: labPerformanceToGrade(clamped) };
  }
  const aligned = alignScoreAndGrade(cat.score, cat.grade);
  return { ...cat, score: aligned.score, grade: aligned.grade };
}

function improveGrade(grade: LetterGrade | null, steps = 2): LetterGrade | null {
  if (!grade) return null;
  const order: LetterGrade[] = ['F', 'D', 'C', 'B', 'A'];
  const i = order.indexOf(grade);
  if (i < 0) return grade;
  return order[Math.min(order.length - 1, i + steps)];
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\[\s*[xX ]\s*\]\s*/, '')
    .trim();
}

function bulletsFromSection(section: string): string[] {
  const out: string[] = [];
  for (const raw of section.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '---' || /^#{1,6}\s/.test(trimmed)) continue;

    // Markdown table data rows → "404: /path — context"
    const tableRow = trimmed.match(/^\|?\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]*)\|?\s*$/);
    if (tableRow) {
      const a = tableRow[1].trim();
      const b = tableRow[2].trim();
      const c = tableRow[3].trim();
      // Skip header / separator rows.
      if (/^[-:]+$/.test(a.replace(/\s/g, '')) || /status|url|context|code/i.test(a)) continue;
      const line = c ? `${a}: ${b} — ${c}` : `${a}: ${b}`;
      if (line.length > 2) out.push(stripMd(line));
      continue;
    }

    const line = stripMd(trimmed);
    if (line.length > 0) out.push(line);
  }
  return out;
}

function extractSection(body: string, heading: RegExp): string {
  // Wrap alternations so `|` cannot escape the heading atom.
  // Accept ## / ### / #### and bold-only headings agents sometimes write.
  // Allow trailing title text after the match ("Broken Links Summary (4 confirmed…)").
  // `\b` keeps a short alt like `SEO` from eating an unrelated longer title mid-word,
  // but still permits "SEO Fundamentals" / "Broken Links Summary".
  const re = new RegExp(
    `(?:^|\\n)(?:#{2,4}\\s+(?:${heading.source})\\b[^\\n]*|\\*\\*(?:${heading.source})\\b[^\\n]*\\*\\*\\s*)\\n([\\s\\S]*?)(?=\\n(?:#{2,4}\\s+|\\*\\*[^*]+\\*\\*\\s*$)|$)`,
    'i',
  );
  const m = body.match(re);
  return m?.[1]?.trim() ?? '';
}

/** Pull Lighthouse-style `performance: 42, accessibility: 78, best-practices: 71, seo: 55`. */
function extractLighthouseScoreMap(text: string): Partial<Record<ReportCardCategoryId, number>> {
  const out: Partial<Record<ReportCardCategoryId, number>> = {};
  const re =
    /\b(performance|accessibility|best[-\s]?practices?|seo)\b\s*[:=]?\s*(\d{1,3})(?:\s*\/\s*100)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].toLowerCase().replace(/\s+/g, '-');
    const n = Number(m[2]);
    if (Number.isNaN(n) || n < 0 || n > 100) continue;
    if (raw.startsWith('performance')) out.performance = n;
    else if (raw.startsWith('accessibility')) out.accessibility = n;
    else if (raw.startsWith('best')) out.best_practices = n;
    else if (raw === 'seo') out.seo = n;
  }
  return out;
}

function findNumber(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return n;
  }
  return null;
}

function findLetterGrade(text: string): LetterGrade | null {
  const m = text.match(
    /\b(?:grade|ssl(?:\s*grade)?|security(?:\s*grade)?)\s*[:\-–]?\s*([ABCDF])\b/i,
  );
  if (m) return m[1].toUpperCase() as LetterGrade;
  const bare = text.match(/\bGrade\s+([ABCDF])\b/i);
  if (bare) return bare[1].toUpperCase() as LetterGrade;
  return null;
}

const NO_SSL_RE =
  /\bnot secure\b|may not be safe|not trusted|certificate has expired|\bexpired\b.{0,20}cert|no ssl\b|missing ssl|tls inspection failed|econnrefused|http,? not https|http only|\bnot https\b|no certificate|lacks? (?:an? )?ssl|without ssl|unencrypted|(?:update|fix|missing|expired|invalid|no).{0,40}security certificate/;

/** Drop praise so "no mixed content" does not look like a mixed-content failure. */
function withoutNegatedSecurityPraise(text: string): string {
  return text
    .replace(/\bno\s+mixed\s+content\b/gi, '')
    .replace(/\bno\s+insecure\s+items\b/gi, '')
    .replace(/\bwithout\s+mixed\s+content\b/gi, '')
    .replace(/\bno\s+console\s+errors?\b/gi, '');
}

function securityIssueGradeFromText(text: string): LetterGrade | null {
  const lower = withoutNegatedSecurityPraise(text.toLowerCase());
  if (/missing .+ header|mixed.content|not fully secure/.test(lower)) return 'D';
  return null;
}

function inferSecurityGrade(sslSection: string, body: string): LetterGrade | null {
  const section = sslSection.trim();
  const failCorpus = (section || body).toLowerCase();
  if (NO_SSL_RE.test(failCorpus)) return 'F';
  if (!section) return null;
  const issue = securityIssueGradeFromText(section);
  if (issue) return issue;
  const lower = section.toLowerCase();
  if (/\bvalid\b|looks good|certificate is valid/.test(lower)) return 'B';
  if (/\bssl\b|certificate|https|security header/.test(lower)) return 'C';
  return 'C';
}

/** Mobile/desktop Lighthouse-style pairs from freeform audit prose. */
function extractMobileDesktopPair(text: string): {
  mobile: number | null;
  desktop: number | null;
} {
  if (!text.trim()) return { mobile: null, desktop: null };
  // Common agent shapes:
  //   Mobile: 96 / 100 · Desktop: 96 / 100 — Outstanding…
  //   mobile performance: 42
  //   Performance score: 42 / 78  (playbook mobile/desktop — see extractPlaybookPair)
  const mobile = findNumber(text, [
    /\bmobile\b[^\n]{0,40}?(?:performance|accessibility|seo|best[-\s]?practices?)?[^\n]{0,20}?[:=]\s*(\d{1,3})/i,
    /\bmobile\b(?:\s+(?:performance|accessibility|seo|best[-\s]?practices?|score))?\s*[:\-–]?\s*(\d{1,3})(?:\s*\/\s*100)?/i,
    /(?:performance|accessibility)[^.\n]{0,40}?\bmobile\b[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  const desktop = findNumber(text, [
    /\bdesktop\b[^\n]{0,40}?(?:performance|accessibility|seo|best[-\s]?practices?)?[^\n]{0,20}?[:=]\s*(\d{1,3})/i,
    /\bdesktop\b(?:\s+(?:performance|accessibility|seo|best[-\s]?practices?|score))?\s*[:\-–]?\s*(\d{1,3})(?:\s*\/\s*100)?/i,
    /(?:performance|accessibility)[^.\n]{0,40}?\bdesktop\b[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  return { mobile, desktop };
}

/**
 * Playbook line: `Performance score: {mobile} / {desktop}`.
 * `88 / 100` is a single score, not two viewports — ignore those.
 */
function extractPlaybookMobileDesktopScores(text: string): {
  mobile: number | null;
  desktop: number | null;
} {
  const m = text.match(/performance(?:\s+score)?\s*[:=]\s*(\d{1,3})\s*\/\s*(\d{1,3})/i);
  if (!m) return { mobile: null, desktop: null };
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || a > 100 || b < 0 || b > 100) {
    return { mobile: null, desktop: null };
  }
  if (b === 100) return { mobile: null, desktop: null };
  return { mobile: a, desktop: b };
}

/** `MOBILE` / `DESKTOP` blocks from formatLighthouseResults. */
function extractLabeledStrategyScores(
  text: string,
  category: 'performance' | 'accessibility',
): { mobile: number | null; desktop: number | null } {
  const scoreFrom = (block: string | undefined): number | null => {
    if (!block) return null;
    return findNumber(block, [new RegExp(`\\b${category}\\b\\s*[:=]\\s*(\\d{1,3})`, 'i')]);
  };
  const mobileBlock = text.match(
    /(?:^|\n)\s*MOBILE(?:\s*\(lab\))?\s*\n([\s\S]*?)(?=\n\s*DESKTOP\b|\n\s*#{2,4}\s+|$)/i,
  )?.[1];
  const desktopBlock = text.match(
    /(?:^|\n)\s*DESKTOP(?:\s*\(lab\))?\s*\n([\s\S]*?)(?=\n\s*MOBILE\b|\n\s*#{2,4}\s+|$)/i,
  )?.[1];
  return { mobile: scoreFrom(mobileBlock), desktop: scoreFrom(desktopBlock) };
}

function extractPerformanceViewportPair(text: string): {
  mobile: number | null;
  desktop: number | null;
} {
  const playbook = extractPlaybookMobileDesktopScores(text);
  const labeled = extractLabeledStrategyScores(text, 'performance');
  const pair = extractMobileDesktopPair(text);
  return {
    mobile: playbook.mobile ?? labeled.mobile ?? pair.mobile,
    desktop: playbook.desktop ?? labeled.desktop ?? pair.desktop,
  };
}

function cruxCategoryToScore(raw: string): number | null {
  const cat = raw.toUpperCase().replace(/\s+/g, '_');
  if (cat === 'FAST' || cat === 'GOOD') return 90;
  if (cat === 'AVERAGE' || cat === 'NEEDS_IMPROVEMENT') return 68;
  if (cat === 'SLOW' || cat === 'POOR') return 38;
  return null;
}

/** Chrome UX Report / field-data line from lighthouse tool output or audit prose. */
function extractCruxFieldScore(text: string): number | null {
  if (!text.trim()) return null;
  const patterns = [
    /field data\s*\(this URL\)\s*[:=—\-–]\s*(FAST|AVERAGE|SLOW|GOOD|POOR|NEEDS\s+IMPROVEMENT)/i,
    /field data\s*\(origin\)\s*[:=—\-–]\s*(FAST|AVERAGE|SLOW|GOOD|POOR|NEEDS\s+IMPROVEMENT)/i,
    /real-user experience[^\n]{0,60}?[:=—\-–]\s*(FAST|AVERAGE|SLOW|GOOD|POOR|NEEDS\s+IMPROVEMENT)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = cruxCategoryToScore(m[1]);
    if (n != null) return n;
  }
  return null;
}

function averageScores(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((n): n is number => n != null && !Number.isNaN(n));
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Prefer explicit mobile/desktop scores; average when both exist. */
function extractMobileDesktopScore(text: string): number | null {
  const { mobile, desktop } = extractMobileDesktopPair(text);
  return averageScores([mobile, desktop]);
}

/** Prefer field data, then mobile/desktop lab average, then a single generic score. */
function extractPerformanceScore(text: string): number | null {
  const crux = extractCruxFieldScore(text);
  if (crux != null) return crux;
  const { mobile, desktop } = extractPerformanceViewportPair(text);
  const lab = averageScores([mobile, desktop]);
  if (lab != null) return lab;
  return findNumber(text, [
    /(?:scores?[^\n]{0,60})?\bperformance\s*[:=]\s*(\d{1,3})/i,
    /(?:performance|perf(?:ormance)?\s*score)\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?(\d{1,3})\s*\/\s*100/i,
  ]);
}

function extractNamedScore(text: string, names: RegExp): number | null {
  return findNumber(text, [
    new RegExp(`(?:${names.source})(?:\\s*score)?\\s*[:\\-–]?\\s*(\\d{1,3})`, 'i'),
    new RegExp(`(?:${names.source})[^.\\n]{0,40}?(\\d{1,3})\\s*\\/\\s*100`, 'i'),
  ]);
}

/** Section-local `Score: 100/100` / `Score: 100` (common in Lighthouse writeups). */
function extractBareScore(text: string): number | null {
  if (!text.trim()) return null;
  return findNumber(text, [
    /\bscore\s*[:=]?\s*(\d{1,3})\s*\/\s*100\b/i,
    /\bscore\s*[:=]?\s*(\d{1,3})\b/i,
  ]);
}

type PresenceSignal = {
  status: 'strong' | 'ok' | 'weak' | 'missing' | 'unknown' | 'unavailable';
  summary: string;
  why: string[];
};

/** Split freeform presence prose into sentence-sized snippets (never whole paragraphs). */
function presenceSnippets(text: string): string[] {
  const chunks: string[] = [];
  for (const line of text.split('\n')) {
    const cleaned = stripMd(line);
    if (!cleaned || cleaned === '---' || /^#{1,6}\s/.test(cleaned)) continue;
    const parts = cleaned.split(/(?<=[.!?])\s+|\s*;\s*/).map((s) => s.trim());
    for (const part of parts) {
      if (part.length > 8) chunks.push(part);
    }
  }
  // De-dupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= 24) break;
  }
  return out;
}

function assessChannel(
  corpus: string,
  opts: {
    keywords: RegExp[];
    /** When Online Presence was checked but this channel was never named. */
    omittedAsMissing?: boolean;
    omittedSummary?: string;
    omittedWhy?: string;
  },
  presenceAudited: boolean,
): PresenceSignal {
  const snippets = presenceSnippets(corpus);
  const hits = snippets.filter((line) => opts.keywords.some((re) => re.test(line)));

  if (!hits.length) {
    if (presenceAudited && opts.omittedAsMissing) {
      return {
        status: 'missing',
        summary: opts.omittedSummary || 'Not found in the presence check',
        why: [
          opts.omittedWhy ||
            'The online presence check did not mention this channel — usually means no listing turned up.',
        ],
      };
    }
    return {
      status: 'unknown',
      summary: 'Not covered in this audit',
      why: ['This category was not called out in the written audit notes.'],
    };
  }

  const joined = hits.join(' ').toLowerCase();
  const why = prioritizeNegativeFirst(hits).slice(0, 4);

  if (
    /unavailable|quota exceeded|data unavailable|could not (?:check|verify|find)|search quota/.test(
      joined,
    )
  ) {
    return { status: 'unavailable', summary: 'Could not verify right now', why };
  }

  // Missing only when the *matched* snippet itself denies the listing.
  const isMissingLine = (h: string) =>
    /not (?:found|claimed|listed|set up|configured|verified|confirmed)|no confirmed|no (?:clear\s+)?(?:listing|profile|page|presence)|(?:no|not)\s+(?:on\s+)?(?:apple|google)|\bmissing\b|none found|does not (?:appear|exist)|invisible|unlisted|no clear\b|critical gap/i.test(
      h,
    );
  const missingHit = hits.some(isMissingLine);
  // Positive evidence must come from a non-denial line — otherwise
  // "no listing found" / "Listings: Yelp missing" falsely look present.
  const positiveHit = hits.some(
    (h) =>
      !isMissingLine(h) &&
      /(?:\bfound\b|\bclaimed\b|\bactive\b|\bverified\b|\bcomplete\b|appears|shows up|maps pin|\breviews?\b|\bstars?\b)/i.test(
        h,
      ),
  );
  if (missingHit && !positiveHit) {
    return { status: 'missing', summary: 'No listing found', why };
  }

  if (
    missingHit ||
    /conflict|outdated|incomplete|inconsistent|wrong hours|not claimed|unclaimed|inactive|stale|placeholder|needs update|hours (?:don.?t|do not) match|few reviews|unanswered|spam|thin|months ago/.test(
      joined,
    )
  ) {
    return { status: 'weak', summary: 'Needs attention', why };
  }
  if (positiveHit) {
    const hasPraise = /strong|optimized|complete|verified|looking good|excellent|great|active/.test(
      joined,
    );
    return {
      status: hasPraise ? 'strong' : 'ok',
      summary: hasPraise ? 'Looking solid' : 'Listing found',
      why,
    };
  }

  return { status: 'weak', summary: why[0] || 'Listing needs cleanup', why };
}

function signalToGrade(signal: PresenceSignal): LetterGrade | null {
  switch (signal.status) {
    case 'strong':
      return 'A';
    case 'ok':
      return 'B';
    case 'weak':
      return 'D';
    case 'missing':
      return 'F';
    default:
      return null;
  }
}

/** How much of a channel's weight a presence status earns (missing = 0). */
function signalWeightFactor(status: PresenceSignal['status']): number | null {
  switch (status) {
    case 'strong':
      return 1;
    case 'ok':
      return 0.85;
    case 'weak':
      return 0.4;
    case 'missing':
      return 0;
    default:
      return null; // unknown / unavailable — exclude from denominator
  }
}

type WeightedChannel = {
  label: string;
  signal: PresenceSignal;
  /** Share of the combined 100-point listings score. */
  weight: number;
};

/**
 * Roll Google / Apple / other directories into one coverage score (0–100).
 * Zero presence across checked channels → 0, not a mid-band "F = 40".
 */
function combineLocalListings(
  channels: WeightedChannel[],
  clientName = '',
): { signal: PresenceSignal; score: number | null } {
  let earned = 0;
  let possible = 0;
  const why: string[] = [];
  const present: string[] = [];
  const gaps: string[] = [];

  for (const ch of channels) {
    const factor = signalWeightFactor(ch.signal.status);
    if (factor == null) continue;
    possible += ch.weight;
    earned += ch.weight * factor;
    if (ch.signal.status === 'missing') {
      gaps.push(ch.label);
    } else if (ch.signal.status === 'weak') {
      gaps.push(`${ch.label} (needs cleanup)`);
      present.push(ch.label);
    } else {
      present.push(ch.label);
    }
    for (const line of ch.signal.why) {
      if (why.length >= 4) break;
      if (!why.includes(line)) why.push(line);
    }
  }

  if (possible === 0) {
    return {
      signal: {
        status: 'unknown',
        summary: 'Not covered in this audit',
        why: ['Maps and directory listings were not checked in the audit notes.'],
      },
      score: null,
    };
  }

  const score = Math.round((earned / possible) * 100);
  const name = clientName.trim();
  const gapList = gaps.slice(0, 3).join(', ');
  const presentList = present.slice(0, 3).join(', ');

  let status: PresenceSignal['status'];
  let summary: string;
  if (score <= 0) {
    status = 'missing';
    summary = name
      ? `${name} is missing from Google, Apple Maps, and major directories.`
      : 'Missing from Google, Apple Maps, and major directories.';
  } else if (score < 60) {
    status = 'weak';
    summary = gapList
      ? `Thin maps & directory coverage — gaps on ${gapList}.`
      : 'Thin maps & directory coverage across the major platforms.';
  } else if (score < 80) {
    status = 'ok';
    summary = presentList
      ? `Listed in places (${presentList}), but coverage is incomplete.`
      : 'Listed in places, but coverage is incomplete.';
  } else if (score < 90) {
    status = 'ok';
    summary = 'Solid coverage across the major maps and directories.';
  } else {
    status = 'strong';
    summary = 'Strong presence across Google, Apple Maps, and major directories.';
  }

  if (!why.length) {
    why.push(
      score <= 0
        ? 'No confirmed Google Business, Apple Maps, or major directory listing turned up.'
        : 'Coverage is based on Google Business Profile, Apple Maps, and other directories mentioned in the audit.',
    );
  }

  return { signal: { status, summary, why }, score };
}

function emailGradeFromText(text: string): {
  grade: LetterGrade | null;
  summary: string;
  why: string[];
  unavailable?: boolean;
} {
  const lower = text.toLowerCase();
  if (!text.trim()) {
    return {
      grade: null,
      summary: 'Not covered in this audit',
      why: ['Email authentication was not detailed in the audit notes.'],
      unavailable: true,
    };
  }
  if (/unavailable|could not/.test(lower)) {
    return {
      grade: null,
      summary: 'Could not verify',
      why: prioritizeNegativeFirst(bulletsFromSection(text)).slice(0, 4),
      unavailable: true,
    };
  }

  const check = (name: string): 'pass' | 'fail' | 'unknown' => {
    const re = new RegExp(
      `${name}\\s*[:\\-–]?\\s*(pass|present|configured|valid|ok|fail|missing|absent|none|not\\s+(?:found|configured|set))`,
      'i',
    );
    const m = text.match(re);
    if (!m) {
      if (new RegExp(`(?:no|missing)\\s+${name}`, 'i').test(text)) return 'fail';
      if (new RegExp(`${name}\\s+(?:record\\s+)?(?:found|present)`, 'i').test(text)) return 'pass';
      return 'unknown';
    }
    const v = m[1].toLowerCase();
    if (/pass|present|configured|valid|ok/.test(v)) return 'pass';
    return 'fail';
  };

  const spf = check('spf');
  const dkim = check('dkim');
  const dmarc = check('dmarc');
  const known = [spf, dkim, dmarc].filter((x) => x !== 'unknown');
  if (!known.length) {
    return {
      grade: null,
      summary: 'Email setup noted',
      why: prioritizeNegativeFirst(bulletsFromSection(text)).slice(0, 4),
    };
  }

  const passes = known.filter((x) => x === 'pass').length;
  const ratio = passes / known.length;
  const grade: LetterGrade =
    ratio >= 1 ? 'A' : ratio >= 0.67 ? 'C' : ratio >= 0.34 ? 'D' : 'F';
  const labels = prioritizeNegativeFirst([
    `SPF: ${spf === 'unknown' ? 'not checked' : spf}`,
    `DKIM: ${dkim === 'unknown' ? 'not checked' : dkim}`,
    `DMARC: ${dmarc === 'unknown' ? 'not checked' : dmarc}`,
  ]);
  // Drop raw SPF/DKIM/DMARC bullets — the structured labels already cover them.
  const extras = bulletsFromSection(text).filter((b) => !/^\s*(spf|dkim|dmarc)\b/i.test(b));
  return {
    grade,
    summary:
      grade === 'A'
        ? 'Authentication looks complete'
        : 'Email authentication gaps',
    why: prioritizeNegativeFirst([...labels, ...extras]).slice(0, 5),
  };
}

function domainGradeFromText(text: string): {
  grade: LetterGrade | null;
  summary: string;
  why: string[];
} {
  const why = prioritizeNegativeFirst(bulletsFromSection(text)).slice(0, 4);
  if (!text.trim()) {
    return {
      grade: null,
      summary: 'Not covered in this audit',
      why: ['Domain / DNS details were not included.'],
    };
  }
  const lower = text.toLowerCase();
  if (/expir(?:ed|ing)|no a record|nxdomain|not resolving|dns failed/.test(lower)) {
    return { grade: 'F', summary: 'Domain or DNS problem', why };
  }
  if (/whois|a record|nameserver|registrar|propagat/.test(lower)) {
    if (/lag|mismatch|issue|problem|warn/.test(lower)) {
      return {
        grade: 'C',
        summary: why[0] || 'DNS records have warnings that should be cleaned up.',
        why,
      };
    }
    return { grade: 'B', summary: 'Domain resolves', why };
  }
  return { grade: 'C', summary: 'Domain notes on file', why };
}

/** Lighthouse / speed copy that agents sometimes dump under Domain & IP Reputation. */
const LIGHTHOUSE_REPUTATION_NOISE_RE =
  /lighthouse|speed & quality scan|best[-\s]?practices?|console errors?|both viewports|page ?speed|core web vitals|\bfcp\b|\blcp\b|\bcls\b|render-blocking/i;

const REPUTATION_SIGNAL_RE =
  /(?:safe\s*browsing)|(?:black|block)lists?|spamhaus|surbl|spamcop|listed on barracuda|barracuda (?:blocklist|rbl|brbl)|\bbrbl\b|ip reputation|domain reputation|network reputation|reputation flags?|malware|phishing|deceptive site/i;

/** MX / SPF / DKIM / DMARC write-ups — Email Deliverability, not Domain & IP Reputation. */
const EMAIL_AUTH_NOISE_RE =
  /\b(?:mx|spf|dkim|dmarc)\b|mail runs through|email security|microsoft 365|allowed email sender|email authenticity|anti-spoofing|mailgun|createsend|campaign monitor|selector\d/i;

const REPUTATION_BAD_RE =
  /\b(?:black|block)listed\b|listed on .{0,60}(?:spamhaus|(?:black|block)lists?)|\bon spamhaus\b|spamhaus (?:hit|list|zen)|safe browsing (?:hit|flag|warning|block)|flagged (?:as )?(?:malware|phishing|spam|unsafe|deceptive)|poor reputation|trending down|deceptive site|\bmalware\b|\bphishing\b/i;

const REPUTATION_GOOD_RE =
  /no reputation flags?(?: found)?|not (?:listed|flagged|blacklisted|blocklisted)|clean(?: reputation)?|clear of (?:black|block)lists?|not on (?:any )?(?:black|block)lists?|good reputation|no (?:safe browsing|malware|phishing|blocklist)/i;

function isReputationRelevantLine(line: string): boolean {
  const t = stripMd(line);
  if (!t || t.length < 4) return false;
  if (/^reviews?\s*&?\s*reputation\b/i.test(t)) return false;
  if (LIGHTHOUSE_REPUTATION_NOISE_RE.test(t) && !REPUTATION_SIGNAL_RE.test(t)) return false;
  // Barracuda-the-gateway / SPF-DKIM-DMARC notes are email, not blocklist reputation.
  if (
    EMAIL_AUTH_NOISE_RE.test(t) &&
    !/(?:safe\s*browsing)|(?:black|block)lists?|spamhaus|surbl|reputation flags?/i.test(t)
  ) {
    return false;
  }
  return REPUTATION_SIGNAL_RE.test(t);
}

function reputationLineIsBad(line: string): boolean {
  if (REPUTATION_GOOD_RE.test(line)) return false;
  return REPUTATION_BAD_RE.test(line);
}

function reputationFromText(
  text: string,
  clientName = '',
): {
  grade: LetterGrade | null;
  summary: string;
  why: string[];
  unavailable?: boolean;
} {
  const relevant = bulletsFromSection(text).filter(isReputationRelevantLine);
  const why = clientFriendlyBullets(relevant, 4, clientName);
  if (!relevant.length) {
    return {
      grade: null,
      summary: 'Not scored in this audit',
      why: [
        'Safe Browsing, spam blocklists, and network reputation were not documented in this audit.',
      ],
      unavailable: true,
    };
  }

  if (relevant.some(reputationLineIsBad)) {
    const finding =
      why.find((w) => reputationLineIsBad(w)) ||
      why[0] ||
      'Domain or IP reputation looks weak on Safe Browsing, spam blocklists, or network checks.';
    return {
      grade: 'D',
      summary: truncateFinding(plainLanguage(finding, clientName)),
      why: why.length ? why : [finding],
    };
  }
  if (relevant.some((line) => REPUTATION_GOOD_RE.test(line))) {
    const summary = 'No Safe Browsing, spam blocklist, or network-reputation flags turned up.';
    return { grade: 'B', summary, why: why.length ? why : [summary] };
  }
  return {
    grade: 'C',
    summary:
      why[0] ||
      'Reputation was checked, but the notes do not clearly say whether the domain is clean or flagged.',
    why: why.length ? why : ['Reputation checks were noted without a clear clean/flagged result.'],
  };
}

/** Soften technical jargon into money-relevant plain language for clients. */
function plainLanguage(line: string, clientName = ''): string {
  const name = clientName.trim();
  let out = line
    .replace(/\bFCP\b/gi, 'how fast the page first appears')
    .replace(/\bLCP\b/gi, 'how fast the main content loads')
    .replace(/\bCLS\b/gi, 'layout jumping around')
    .replace(/\bCSP\b/g, 'browser safety rules')
    .replace(/\bHSTS\b/g, 'always-secure connection setting')
    .replace(/\bDMARC\b/gi, 'anti-spoofing email protection')
    .replace(/\bDKIM\b/gi, 'email authenticity signing')
    .replace(/\bSPF\b/gi, 'allowed email sender list')
    .replace(/\bTLS\b/g, 'encryption')
    .replace(/\bWCAG(?:\s*2\.?\d)?(?:\s*AA)?\b/gi, 'accessibility standards')
    .replace(/\bNAP\b/g, 'name, address, and phone')
    .replace(/\bschema\.org\b/gi, 'search markup')
    .replace(/\bJSON-?LD\b/gi, 'search markup')
    .replace(/\bGA4\b/g, 'Google Analytics')
    .replace(/\bGTM\b/g, 'tag manager')
    .replace(/\bmixed content\b/gi, 'insecure items loading on a secure page')
    .replace(/\bA\/AAAA records?\b/gi, 'website address records')
    .replace(/\bMX records?\b/gi, 'email routing')
    .replace(/\bWHOIS\b/gi, 'domain registration')
    .replace(/\bLighthouse\b/gi, 'speed & quality scan')
    .replace(/\bPageSpeed(?:\s*Insights)?\b/gi, 'Google speed test')
    .replace(
      /no exact (?:street-level )?address match(?: for "[^"]+")?/gi,
      'no business match found',
    );
  // Prefer the real client name over generic "this business" phrasing.
  out = out.replace(/\b[Tt]his business\b/g, name || 'the business');
  return out.trim();
}

const ROSY_FINDING_RE =
  /outstanding|excellent|perfect|strong|solid|looking (?:good|solid|great)|looks? great|no (?:major )?(?:issues?|problems?)|across both viewports|well (?:configured|optimized)|complete coverage|authentication looks complete|ssl valid|certificate is valid|no insecure items|no mixed content/i;
const WEAK_FINDING_RE =
  /missing|fail|expired|invalid|critical|no confirmed|not (?:found|listed|claimed|configured|set|verified)|weak|risk|error|insecure|broken|none\b|gap|needs? (?:work|attention|update)|room to improve|poor|low contrast|too small|outdated|incomplete|inconsistent|unclaimed|inactive|stale|spam|thin|absent|unprotected|conflict|wrong hours|few reviews|unanswered|placeholder|could not|unavailable|blocks? (?:all )?crawler|noindex|dead (?:link|ui)|404\b|500\b|empty anchors?/i;

function isNegativeFinding(line: string): boolean {
  // "0 broken links" / "no broken links" are praise, not failures.
  if (/\b(?:0|no|zero)\s+broken\b/i.test(line) || /\blinks (?:look |are )?healthy\b/i.test(line)) {
    return false;
  }
  // "no console errors flagged" / "no mixed content" / "no reputation flags" are clean.
  if (
    /\b(?:no|zero|0|none)\s+(?:console\s+)?errors?\b/i.test(line) ||
    /\bno\s+(?:reputation\s+)?flags?\s+found\b/i.test(line) ||
    /\bno\s+(?:mixed\s+content|insecure\s+items)\b/i.test(line) ||
    /\bnot\s+(?:listed|flagged|blacklisted|blocklisted)\b/i.test(line) ||
    /\b(?:no|none|nothing)\s+flagged\b/i.test(line)
  ) {
    return false;
  }
  return WEAK_FINDING_RE.test(line);
}

function isRosyFinding(line: string): boolean {
  // Don't treat a line as praise when it also flags a problem
  // ("no outstanding issues" is fine; "outstanding… but missing alt" is not rosy).
  return ROSY_FINDING_RE.test(line) && !isNegativeFinding(line);
}

/** Negatives first, then neutral, then praise — stable within each band. */
function prioritizeNegativeFirst(lines: string[]): string[] {
  const rank = (line: string) => (isNegativeFinding(line) ? 0 : isRosyFinding(line) ? 2 : 1);
  return lines
    .map((line, index) => ({ line, index, rank: rank(line) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.line);
}

function clientFriendlyBullets(lines: string[], limit = 4, clientName = ''): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = plainLanguage(raw, clientName);
    if (line.length <= 2) continue;
    const key = line.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(line);
  }
  // Sort before the limit so a trailing "missing alt text" is never sliced away
  // in favor of an earlier "Outstanding score…" line.
  return prioritizeNegativeFirst(cleaned).slice(0, limit);
}

/**
 * Agency-only Search Console / GA account notes. Never show these to the client —
 * the portal card is "is tracking installed on the website?", not "do we have API access?".
 */
const AGENCY_ANALYTICS_COPY_RE =
  /not run|no owned property|owned property|we don'?t control|do not control|third-party (?:national )?brand|no verified (?:search console|google analytics|plausible)|verified search console|search console (?:auth|quota|access|property)|analytics_failed|\*\*failed\*\*|status:\s*failed|could not (?:load|fetch) analytics|indexnow.{0,60}(?:sites we|we (?:don't |do not )?control)|agency (?:google|gsc|ga4|access|account)/i;

function isAgencyAnalyticsCopy(text: string): boolean {
  return AGENCY_ANALYTICS_COPY_RE.test(text);
}

/** Tighter leak filter for Opportunities / Action Items (avoids dropping unrelated "not run" lines). */
function isAgencyAnalyticsClientLeak(text: string): boolean {
  return /owned property|we don'?t control|do not control|third-party (?:national )?brand|verified search console|search console (?:auth|quota|access|property)|analytics_failed|indexnow.{0,60}(?:sites we|we (?:don't |do not )?control)|agency (?:google|gsc|ga4|access|account)/i.test(
    text,
  );
}

const SITE_TRACKING_TOOLS: { name: string; re: RegExp }[] = [
  { name: 'Google Analytics', re: /google analytics|\bga4\b|\bgtag\b|\bua-\d{4,}|\bg-[a-z0-9]{8,}/i },
  { name: 'Google Tag Manager', re: /(?:google )?tag manager|\bgtm-[a-z0-9]+/i },
  { name: 'Plausible', re: /\bplausible\b/i },
  { name: 'Fathom', re: /\bfathom\b/i },
  { name: 'Hotjar', re: /\bhotjar\b/i },
  { name: 'Meta Pixel', re: /facebook pixel|meta pixel|\bfbq\s*\(/i },
];

const TRACKING_NEGATION_RE =
  /\bno\b.{0,60}(?:analytics|tracking|pixel|tag manager|conversion|gtm|ga4|plausible)|missing (?:analytics|tracking)|not (?:installed|configured|found|detected|present)|untracked|none (?:found|detected|installed)|assumed not set up/i;

function lineDeniesTracking(line: string): boolean {
  return TRACKING_NEGATION_RE.test(line) || isAgencyAnalyticsCopy(line);
}

function detectInstalledTracking(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = stripMd(line);
    if (!trimmed || lineDeniesTracking(trimmed)) continue;
    for (const tool of SITE_TRACKING_TOOLS) {
      if (tool.re.test(trimmed) && !found.includes(tool.name)) found.push(tool.name);
    }
  }
  return found;
}

function listWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function siteTrackingCorpus(
  installSection: string,
  techStackSection: string,
  bodyWithoutSearchAnalytics: string,
): string {
  const parts: string[] = [];
  if (installSection.trim() && !isAgencyAnalyticsCopy(installSection)) {
    parts.push(installSection);
  } else if (installSection.trim()) {
    const kept = installSection
      .split('\n')
      .filter((line) => stripMd(line) && !isAgencyAnalyticsCopy(line))
      .join('\n');
    if (kept.trim()) parts.push(kept);
  }
  if (techStackSection.trim()) parts.push(techStackSection);
  if (!parts.length && bodyWithoutSearchAnalytics.trim()) {
    const relevant = bodyWithoutSearchAnalytics
      .split('\n')
      .filter((line) => {
        const t = stripMd(line);
        return SITE_TRACKING_TOOLS.some((tool) => tool.re.test(t)) || TRACKING_NEGATION_RE.test(t);
      })
      .join('\n');
    if (relevant.trim()) parts.push(relevant);
  }
  return parts.join('\n');
}

function scoreSiteTrackingCategory(
  installSection: string,
  techStackSection: string,
  bodyWithoutSearchAnalytics: string,
  clientName: string,
  searchAnalyticsSection = '',
): ReportCardCategory {
  const meta = CATEGORY_BY_ID.get('analytics')!;
  const corpus = siteTrackingCorpus(installSection, techStackSection, bodyWithoutSearchAnalytics);
  const tools = detectInstalledTracking(corpus);
  const wroteAnalytics =
    Boolean(installSection.trim() || techStackSection.trim() || searchAnalyticsSection.trim());
  const missing =
    tools.length === 0 &&
    (TRACKING_NEGATION_RE.test(corpus) ||
      isAgencyAnalyticsCopy(installSection) ||
      isAgencyAnalyticsCopy(searchAnalyticsSection) ||
      /analytics|tracking|gtm|ga4|pixel|tag manager/i.test(corpus) ||
      wroteAnalytics);

  const goalsConfigured =
    /(?:conversion )?goals? (?:are )?(?:set|configured|working)|events? (?:are )?(?:tracked|configured)/i.test(
      corpus,
    ) && !/(?:no|not|missing) (?:conversion )?goals?/i.test(corpus);
  const goalsMissing =
    tools.length > 0 &&
    /no (?:conversion )?goals?|goals? (?:not |aren'?t |are not )(?:set|configured)|untracked leads|conversion (?:tracking )?(?:not |isn'?t )(?:set|configured)/i.test(
      corpus,
    );

  let grade: LetterGrade;
  let finding: string;
  if (tools.length > 0 && goalsMissing) {
    grade = 'C';
    finding = `${listWithAnd(tools)} ${tools.length === 1 ? 'is' : 'are'} installed, but conversion goals are not configured.`;
  } else if (tools.length > 0 && goalsConfigured) {
    grade = 'B';
    finding = `${listWithAnd(tools)} ${tools.length === 1 ? 'is' : 'are'} installed and conversion tracking looks configured.`;
  } else if (tools.length > 0) {
    grade = 'B';
    finding = `${listWithAnd(tools)} ${tools.length === 1 ? 'is' : 'are'} installed on the website.`;
  } else {
    grade = 'D';
    finding = 'No analytics or conversion tracking was found on the website.';
  }

  const rawWhy = clientFriendlyBullets(
    bulletsFromSection(corpus).filter((line) => !isAgencyAnalyticsCopy(line)),
    4,
    clientName,
  );
  const why = rawWhy.length ? rawWhy : [finding];

  // Hide the tile only when the audit never mentioned tracking at all.
  const looked =
    wroteAnalytics ||
    tools.length > 0 ||
    missing ||
    /analytics|tracking|gtm|ga4|pixel|tag manager|gtag/i.test(corpus);

  if (!looked) {
    return {
      id: 'analytics',
      label: meta.label,
      icon: meta.icon,
      source: meta.source,
      summary: 'Not scored in this audit',
      finding: 'Not scored in this audit',
      grade: null,
      score: null,
      why: ['No analytics or conversion tracking section was written in this audit.'],
      unavailable: true,
    };
  }

  return {
    id: 'analytics',
    label: meta.label,
    icon: meta.icon,
    source: meta.source,
    summary: finding,
    finding,
    grade,
    score: gradeToScore(grade),
    why,
    unavailable: false,
  };
}

const FINDING_MAX_CHARS = 180;

/** Cap length without dropping a leading negative clause when possible. */
function truncateFinding(text: string): string {
  if (text.length <= FINDING_MAX_CHARS) return text;
  // Prefer cutting after a sentence/clause boundary so the issue stays intact.
  const budget = FINDING_MAX_CHARS - 1;
  const window = text.slice(0, budget);
  const boundary = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('; '),
    window.lastIndexOf(' — '),
    window.lastIndexOf(' - '),
  );
  if (boundary >= 60) {
    return `${window.slice(0, boundary + (window[boundary] === '.' ? 1 : 0)).trim()}…`;
  }
  return `${window.trim()}…`;
}

/**
 * First usable finding for a category card.
 * Negatives always win over praise so truncation cannot hide problems.
 */
function primaryFinding(why: string[], fallback: string): string {
  const ordered = prioritizeNegativeFirst(why.filter((w) => w && w.length > 2));
  const negative = ordered.find((w) => isNegativeFinding(w) && w.length > 12);
  const first =
    negative || ordered.find((w) => w.length > 12) || ordered[0] || fallback;
  if (!first) return fallback;
  return truncateFinding(first);
}

/** Prefer a finding that matches a weak/failing grade instead of a rosy first bullet. */
function primaryFindingForGrade(
  why: string[],
  fallback: string,
  grade: LetterGrade | null,
): string {
  if (grade === 'C' || grade === 'D' || grade === 'F') {
    const negative = prioritizeNegativeFirst(why).find((w) => isNegativeFinding(w));
    if (negative) return primaryFinding([negative], fallback);
    // Middling/poor grade with only praise in the bullets — never claim "outstanding".
    const first = why.find((w) => w.length > 12) || why[0];
    if (first && isRosyFinding(first)) return fallback;
  }
  return primaryFinding(why, fallback);
}

/** Honest fallback when bullets are empty or only praise a weak grade — never "needs a closer look". */
function concreteFindingFallback(
  why: string[],
  label: string,
  score: number | null,
  grade: LetterGrade | null,
): string {
  const usable = why.find(
    (w) =>
      w.length > 12 &&
      !/^no detailed\b/i.test(w) &&
      !/needs a closer look/i.test(w) &&
      !/^not scored\b/i.test(w),
  );
  if (usable) return truncateFinding(usable);
  if (score != null && grade) {
    return `${label} scored ${score}/100 (grade ${grade}) — see technical notes for the supporting detail.`;
  }
  if (grade) {
    return `${label} graded ${grade} — see technical notes for the supporting detail.`;
  }
  if (score != null) return `${label} scored ${score}/100.`;
  return `${label} was reviewed; see technical notes for detail.`;
}

/**
 * Keep card copy honest when mobile/desktop numbers and the graded score disagree.
 * Near-perfect viewport scores must not sit next to a C without saying what dragged it down.
 * Concrete issue bullets still lead — score context is secondary.
 */
function findingAlignedToScore(
  why: string[],
  label: string,
  score: number | null,
  grade: LetterGrade | null,
  sectionText = '',
): string {
  const fallback = concreteFindingFallback(why, label, score, grade);
  const ordered = prioritizeNegativeFirst(why);
  const negative = ordered.find((w) => isNegativeFinding(w) && w.length > 12);
  const blob = `${sectionText}\n${why.join('\n')}`;
  const pair =
    /performance|speed/i.test(label)
      ? extractPerformanceViewportPair(blob)
      : extractMobileDesktopPair(blob);
  if (pair.mobile != null && pair.desktop != null && score != null) {
    const avg = Math.round((pair.mobile + pair.desktop) / 2);
    if (score >= avg + 6) {
      return truncateFinding(
        `Real visitors score better than the lab test (overall ${score}/100). ` +
          `Mobile lab ${pair.mobile}/100 · Desktop ${pair.desktop}/100.`,
      );
    }
    if (score <= avg - 6) {
      const context =
        `Mobile ${pair.mobile}/100 · Desktop ${pair.desktop}/100 — overall ${score}/100 ` +
        `after other ${label.toLowerCase()} issues called out in the audit.`;
      if (negative) {
        const combined = `${negative} ${context}`;
        if (combined.length <= FINDING_MAX_CHARS) return combined;
        return truncateFinding(negative);
      }
      return truncateFinding(context);
    }
    return truncateFinding(
      `Mobile lab ${pair.mobile}/100 · Desktop ${pair.desktop}/100 (average ${score}/100).`,
    );
  }
  return primaryFindingForGrade(ordered, fallback, grade);
}

function extractActionItems(body: string): string[] {
  const section = extractSection(body, /Action Items/);
  const source = section || body;
  return source
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*[-*+]\s*\[\s*[xX ]?\s*\]\s*(.+)$/);
      return m ? stripMd(m[1]) : '';
    })
    .filter(Boolean)
    .slice(0, 12);
}

const DOMAIN_RE =
  /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+\b/i;

/** Host from a URL or domain — never a page title / business name. */
export function extractAuditWebsite(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = stripMd(raw).replace(/[.,;]+$/g, '').trim();
  const mdHref = raw.match(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/i);
  if (mdHref) return hostFromWebsite(mdHref[2]);
  const url = text.match(/https?:\/\/[^\s)]+/i);
  if (url) return hostFromWebsite(url[0]);
  const domain = text.match(DOMAIN_RE);
  return domain ? hostFromWebsite(domain[0]) : undefined;
}

function hostFromWebsite(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/[.,;]+$/g, '');
  if (!trimmed) return undefined;
  try {
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.includes('.') || host.length > 80) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

function extractWebsiteLine(body: string): string | undefined {
  const labeled =
    body.match(/\*\*(?:Current\s+)?Website:\*\*\s*(.+)/i) ||
    body.match(/^(?:Current\s+)?Website:\s*(.+)$/im);
  if (!labeled) return undefined;
  return extractAuditWebsite(labeled[1]);
}

/** Explicit Problem/Solution pairs authored in the audit markdown. */
function extractAuthoredIdeas(body: string): ReportCardIdea[] {
  const section = extractSection(body, /Opportunities|Ideas|Recommended (?:Work|Fixes)|Services/);
  const source = section || body;
  const lines = source.split('\n').map((l) => stripMd(l)).filter(Boolean);
  const ideas: ReportCardIdea[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const paired = line.match(
      /^(?:problem|issue)\s*[:\-–]\s*(.+?)\s*(?:→|->|\||;)\s*(?:solution|fix|offer)\s*[:\-–]?\s*(.+)$/i,
    );
    if (paired) {
      ideas.push({
        id: `authored-${ideas.length}`,
        categoryId: 'general',
        categoryLabel: 'Opportunity',
        problem: paired[1].trim(),
        solution: paired[2].trim(),
        priority: 1 + ideas.length,
      });
      continue;
    }

    const problemOnly = line.match(/^(?:problem|issue)\s*[:\-–]\s*(.+)$/i);
    if (problemOnly) {
      const next = lines[i + 1] || '';
      const solutionOnly = next.match(/^(?:solution|fix|offer)\s*[:\-–]\s*(.+)$/i);
      if (solutionOnly) {
        ideas.push({
          id: `authored-${ideas.length}`,
          categoryId: 'general',
          categoryLabel: 'Opportunity',
          problem: problemOnly[1].trim(),
          solution: solutionOnly[1].trim(),
          priority: 1 + ideas.length,
        });
        i += 1;
      }
    }
  }

  return ideas;
}

type IdeaTemplate = {
  id: string;
  categoryId: ReportCardCategoryId;
  categoryLabel: string;
  /** Trigger when grade rank is at or below this (F=1 … A=5). */
  maxRank: number;
  problem: (cat: ReportCardCategory) => string;
  solution: string;
};

const IDEA_TEMPLATES: IdeaTemplate[] = [
  {
    id: 'perf-speed',
    categoryId: 'performance',
    categoryLabel: 'Site Speed',
    maxRank: 3,
    problem: (cat) => {
      const blob = `${cat.finding}\n${cat.why.join('\n')}`.toLowerCase();
      if (/server resource issue|shared hosting|godaddy|blue ?host/.test(blob)) {
        return siteSpeedResearchProblem({
          suffix: 'The build looks lean — the server/host is the bottleneck.',
        });
      }
      if (cat.grade === 'F' || (cat.score != null && cat.score < 25)) {
        return siteSpeedResearchProblem({ suffix: 'This homepage is well past that.' });
      }
      return siteSpeedResearchProblem();
    },
    solution:
      'Speed fix: compress images, cut heavy scripts, and move off underpowered shared hosting when the build is already clean.',
  },
  {
    id: 'a11y-access',
    categoryId: 'accessibility',
    categoryLabel: 'Accessibility',
    maxRank: 3,
    problem: () => 'Parts of the site are hard for some customers to read or tap.',
    solution: 'Accessibility cleanup so more people can use the site comfortably — and you stay compliant.',
  },
  {
    id: 'seo-findable',
    categoryId: 'seo',
    categoryLabel: 'SEO',
    maxRank: 3,
    problem: (cat) => {
      const blob = `${cat.finding}\n${cat.why.join('\n')}`.toLowerCase();
      if (/og:image|open graph|share image/.test(blob)) {
        return 'Links shared on social and text messages show a blank or random preview — no Open Graph image.';
      }
      if (/robots\.txt/.test(blob) && /block|disallow|missing/.test(blob)) {
        return 'robots.txt is missing or blocking crawlers — search engines cannot index the site cleanly.';
      }
      if (/sitemap/.test(blob) && /missing|no xml/.test(blob)) {
        return 'No XML sitemap — Google has no map of your pages and discovers them slowly.';
      }
      if (/favicon/.test(blob) && /missing|no favicon/.test(blob)) {
        return 'No favicon — browser tabs show a generic icon instead of the brand.';
      }
      if (/manifest/.test(blob)) {
        return 'No web app manifest — phones cannot offer a proper Add to Home Screen icon.';
      }
      return 'Search visibility is weaker than it should be for a local business.';
    },
    solution: 'Local SEO package: share images, robots/sitemap, titles, descriptions, and Google Business alignment.',
  },
  {
    id: 'security-harden',
    categoryId: 'security',
    categoryLabel: 'Security',
    maxRank: 3,
    problem: () => 'Browsers may warn visitors that the site is not fully secure.',
    solution: 'Security hardening so the padlock stays clean and customers trust the site.',
  },
  {
    id: 'email-auth',
    categoryId: 'email',
    categoryLabel: 'Email',
    maxRank: 3,
    problem: () => 'Business email can look fake or land in spam — customers may never see your replies.',
    solution: 'Email deliverability setup so messages reach inboxes reliably.',
  },
  {
    id: 'domain-dns',
    categoryId: 'domain',
    categoryLabel: 'Domain',
    maxRank: 2,
    problem: () => 'Domain or DNS issues risk the site or email going dark.',
    solution: 'Domain & DNS cleanup plus renewal monitoring so nothing expires by surprise.',
  },
  {
    id: 'domain-rep',
    categoryId: 'domain_reputation',
    categoryLabel: 'Reputation',
    maxRank: 3,
    problem: () => 'Domain or IP reputation signals look weak — that can hurt email and ads.',
    solution: 'Reputation cleanup and monitoring so mail and campaigns stay trusted.',
  },
  {
    id: 'local-listings',
    categoryId: 'local_listings',
    categoryLabel: 'Maps & Directories',
    maxRank: 3,
    problem: (cat) =>
      cat.score != null && cat.score <= 0
        ? 'Missing from Google, Apple Maps, and major directories — local customers cannot find you.'
        : cat.grade === 'F' || (cat.score != null && cat.score < 60)
          ? 'Maps & directory coverage is thin — gaps on Google, Apple Maps, or Yelp leave customers guessing.'
          : 'Some listings need cleanup (hours, claim status, or missing platforms).',
    solution:
      'Claim and align Google Business, Apple Business Connect, and key directories so every map points to the same business.',
  },
  {
    id: 'social',
    categoryId: 'social',
    categoryLabel: 'Social Spread',
    maxRank: 3,
    problem: () => 'Social profiles look thin, quiet, or inconsistent.',
    solution: 'Social cleanup so customers find a clear, matching presence on the networks they use.',
  },
  {
    id: 'reviews',
    categoryId: 'reviews',
    categoryLabel: 'Reviews',
    maxRank: 3,
    problem: () => 'Reviews are not doing enough work for the business yet.',
    solution: 'Review generation and response plan across Google and key sites.',
  },
  {
    id: 'mobile',
    categoryId: 'mobile',
    categoryLabel: 'Mobile',
    maxRank: 2,
    problem: () => 'The site is awkward on phones — buttons, layout, or text get in the way.',
    solution: 'Mobile polish so the site feels natural on the devices most customers use.',
  },
  {
    id: 'analytics',
    categoryId: 'analytics',
    categoryLabel: 'Tracking',
    maxRank: 3,
    problem: () => 'You cannot see which visits turn into calls or leads.',
    solution: 'Analytics & conversion tracking so every lead is measurable.',
  },
  {
    id: 'broken-links',
    categoryId: 'broken_links',
    categoryLabel: 'Crawl Health',
    maxRank: 3,
    problem: () => 'Broken links waste traffic and look unprofessional.',
    solution: 'Crawl cleanup: fix dead pages and redirect old URLs to the right place.',
  },
  {
    id: 'content',
    categoryId: 'content',
    categoryLabel: 'Content',
    maxRank: 3,
    problem: () => 'The site does not clearly say what you offer or what to do next.',
    solution: 'Content rewrite with a clear offer and call-to-action on key pages.',
  },
  {
    id: 'lead-capture',
    categoryId: 'lead_capture',
    categoryLabel: 'Lead Capture',
    maxRank: 3,
    problem: () => 'Visitors have no easy way to contact you or request a quote.',
    solution: 'Forms, click-to-call, and lead capture that actually reach your inbox.',
  },
  {
    id: 'schema',
    categoryId: 'schema',
    categoryLabel: 'Rich Results',
    maxRank: 3,
    problem: () => 'Google is missing the markup that unlocks richer local search results.',
    solution: 'Local business search markup so hours, reviews, and details can appear in Google.',
  },
];

function buildIdeas(
  categories: ReportCardCategory[],
  body: string,
  actionItems: string[],
): ReportCardIdea[] {
  const authored = extractAuthoredIdeas(body).filter(
    (idea) => !isAgencyAnalyticsClientLeak(`${idea.problem} ${idea.solution}`),
  );
  const byId = new Map(categories.map((c) => [c.id, c]));
  const derived: ReportCardIdea[] = [];

  for (const tmpl of IDEA_TEMPLATES) {
    const cat = byId.get(tmpl.categoryId);
    if (!cat || cat.unavailable || !cat.grade) continue;
    const rank = GRADE_RANK[cat.grade];
    if (rank > tmpl.maxRank) continue;
    derived.push({
      id: tmpl.id,
      categoryId: tmpl.categoryId,
      categoryLabel: tmpl.categoryLabel,
      problem: tmpl.problem(cat),
      solution: tmpl.solution,
      priority: rank + (cat.score != null && cat.score < 50 ? 0 : 0.5),
    });
  }

  // Turn leftover action items into soft ideas when we still have room.
  const covered = new Set(derived.map((d) => d.categoryId));
  for (const item of actionItems) {
    if (derived.length + authored.length >= 8) break;
    const lower = item.toLowerCase();
    if (/reach out|call|email the|follow up/.test(lower)) continue;
    let categoryId: ReportCardCategoryId | 'general' = 'general';
    let categoryLabel = 'Opportunity';
    if (/performance|speed|slow|lighthouse/.test(lower)) {
      categoryId = 'performance';
      categoryLabel = 'Performance';
    } else if (/accessib/.test(lower)) {
      categoryId = 'accessibility';
      categoryLabel = 'Accessibility';
    } else if (/seo|meta|search|schema|rich result/.test(lower)) {
      categoryId = /schema|rich result|structured/.test(lower) ? 'schema' : 'seo';
      categoryLabel = categoryId === 'schema' ? 'Rich Results' : 'SEO';
    } else if (
      /google business|gbp|apple (?:maps|business)|business connect|yelp|bing places|maps & directories|local listings?|directories|citations?|nap/.test(
        lower,
      )
    ) {
      categoryId = 'local_listings';
      categoryLabel = 'Maps & Directories';
    } else if (/ssl|security|header|padlock|https/.test(lower)) {
      categoryId = 'security';
      categoryLabel = 'Security';
    } else if (/spf|dkim|dmarc|email|spam|inbox/.test(lower)) {
      categoryId = 'email';
      categoryLabel = 'Email';
    } else if (/review/.test(lower)) {
      categoryId = 'reviews';
      categoryLabel = 'Reviews';
    } else if (/social|instagram|facebook|tiktok|linkedin/.test(lower)) {
      categoryId = 'social';
      categoryLabel = 'Social Spread';
    } else if (/mobile|responsive|tap target/.test(lower)) {
      categoryId = 'mobile';
      categoryLabel = 'Mobile';
    } else if (/analytics|conversion|tracking|ga4/.test(lower)) {
      categoryId = 'analytics';
      categoryLabel = 'Tracking';
    } else if (/broken link|404|crawl/.test(lower)) {
      categoryId = 'broken_links';
      categoryLabel = 'Crawl Health';
    } else if (/content|copy|messaging|cta|call.to.action/.test(lower)) {
      categoryId = 'content';
      categoryLabel = 'Content';
    } else if (/form|lead|contact|chat/.test(lower)) {
      categoryId = 'lead_capture';
      categoryLabel = 'Lead Capture';
    } else if (/reputation|blacklist|blocklist|spamhaus/.test(lower)) {
      categoryId = 'domain_reputation';
      categoryLabel = 'Reputation';
    }
    if (categoryId !== 'general' && covered.has(categoryId)) continue;
    if (categoryId !== 'general') covered.add(categoryId);
    derived.push({
      id: `action-${derived.length}`,
      categoryId,
      categoryLabel,
      problem: item,
      solution: 'We can take this on as a focused service engagement.',
      priority: 4.5,
    });
  }

  const merged = [...authored, ...derived].sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const out: ReportCardIdea[] = [];
  for (const idea of merged) {
    const key = `${idea.categoryId}:${idea.problem.slice(0, 40).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(idea);
    if (out.length >= 8) break;
  }
  return out;
}

function scoreCategory(
  id: ReportCardCategoryId,
  score: number | null,
  section: string,
  fallbackGrade: LetterGrade | null,
  emptySummary: string,
  overrides?: Partial<Pick<ReportCardCategory, 'label' | 'source' | 'icon' | 'featured'>>,
  clientName = '',
): ReportCardCategory {
  const meta = CATEGORY_BY_ID.get(id);
  const label = overrides?.label || meta?.label || id;
  const grade =
    id === 'performance' && score != null
      ? labPerformanceToGrade(score)
      : (scoreToGrade(score) ?? fallbackGrade);
  const why = clientFriendlyBullets(bulletsFromSection(section), 5, clientName);
  const summary =
    grade == null
      ? section.trim()
        ? `${label} notes on file`
        : emptySummary
      : findingAlignedToScore(why, label, score, grade, section);
  return {
    id,
    label,
    icon: overrides?.icon || meta?.icon || 'search',
    source: overrides?.source || meta?.source || 'Independent platform checks',
    featured: overrides?.featured ?? meta?.featured,
    summary,
    finding: summary,
    grade,
    score,
    why: why.length ? why : [`No detailed ${label.toLowerCase()} notes in this audit.`],
    unavailable: grade == null && !section.trim(),
  };
}

/** True when the Work doc is still the Siri stub (research never wrote the audit). */
export function isAuditWorkInProgress(input: {
  title?: string | null;
  body?: string | null;
}): boolean {
  const body = input.body || '';
  return (
    /siri audit in progress/i.test(body) ||
    /^Auditing\b/i.test(input.title || '') ||
    (body.length < 400 && /research agent is locating/i.test(body))
  );
}

export function isAuditJob(input: {
  status?: string | null;
  tags?: string[] | null;
  source?: string | null;
  title?: string | null;
  body?: string | null;
}): boolean {
  if ((input.status || '').toLowerCase() === 'audit') return true;
  const tags = input.tags ?? [];
  if (tags.some((t) => AUDIT_TAG_RE.test(t))) return true;
  if ((input.source || '').toLowerCase() === 'siri_audit') return true;
  const body = input.body || '';
  if (/siri audit in progress/i.test(body)) return true;
  if (AUDIT_HEADING_RE.test(body)) return true;
  if (/###\s+(?:Website\s+)?Performance/i.test(body) && /###\s+SSL/i.test(body)) return true;
  if (/audit/i.test(input.title || '') && /###\s+/.test(body)) return true;
  return false;
}

export function buildAuditReportCard(input: {
  tags?: string[] | null;
  source?: string | null;
  title?: string | null;
  body?: string | null;
  /** Business / contact name — used in client-facing headlines and findings. */
  clientName?: string | null;
  /**
   * When false, Google Places returned no business-name match at contact create.
   * Forces Maps & Directories / GBP to missing so the client is always aware.
   */
  googlePlacesListed?: boolean | null;
  /** Fallback when the audit body has no Current Website URL (contact portal). */
  website?: string | null;
}): AuditReportCard | null {
  let body = (input.body || '').trim();
  if (!isAuditJob({ ...input, body })) return null;
  const clientName = (input.clientName || '').trim();

  // Deterministic Google Places miss — do not rely on agent prose alone.
  if (input.googlePlacesListed === false) {
    body = ensureGooglePlacesNotListedInAuditBody(body, {
      businessName: clientName,
    }).trim();
  }

  const inProgress = isAuditWorkInProgress({ title: input.title, body });

  if (inProgress) {
    return {
      isAudit: true,
      inProgress: true,
      title: input.title || 'Website audit',
      overall: null,
      featured: null,
      categories: [],
      ideas: [],
      actionItems: [],
      potential: null,
      overallScore: null,
      potentialScore: null,
      criticalCount: 0,
    };
  }

  const perfSection = extractSection(body, /Website Performance|Site Speed|Performance/);
  // Do not use bare "Search" — it steals "Search / Analytics" once trailing title text is allowed.
  const seoSection = extractSection(body, /SEO(?:\s+Fundamentals)?|Search Fundamentals/);
  const a11ySection = extractSection(body, /Accessibility(?:\s*\(WCAG\))?/);
  const bpSection = extractSection(body, /Best Practices|Best\-Practices/);
  const sslSection = extractSection(
    body,
    /SSL\s*&\s*(?:Website\s+)?Security|Website Security|SSL(?:\s+Check)?/,
  );
  const dnsSection = extractSection(
    body,
    /DNS\s*&\s*Email|Domain\s*&\s*DNS(?:\s+Health)?|DNS|Email(?:\s+(?:Auth(?:entication)?|Deliverability))?/,
  );
  const contentSection = extractSection(body, /Content(?:\s+Issues|\s*&\s*Messaging)?|Messaging/);
  const presenceSection = extractSection(
    body,
    /Online Presence|Local Presence|Presence|Listings|Reputation|Social Spread/,
  );
  const uxSection = extractSection(body, /UX\s*&\s*UI|Playwright|Mobile Responsiveness|Mobile/);
  // Client tile = site install check only. Do not prefer "Search / Analytics"
  // (agency GSC/GA access) — that copy must never reach the portal card.
  const analyticsInstallSection = extractSection(
    body,
    /Analytics(?:\s*&\s*Conversion(?:\s+Tracking)?)?|Conversion Tracking/,
  );
  const searchAnalyticsSection = extractSection(body, /Search\s*\/\s*Analytics/);
  const techStackSection = extractSection(body, /Technology Stack|Tech Stack/);
  const bodyWithoutSearchAnalytics = searchAnalyticsSection
    ? body.replace(searchAnalyticsSection, '')
    : body;
  // Agents often write "Broken Links Summary (N confirmed…)" — keep "Summary" optional.
  // Bare "Links" is too greedy against unrelated headings.
  const linksSection = extractSection(
    body,
    /Broken Links(?:\s*&\s*Crawl Health)?(?:\s+Summary)?|Crawl Health/,
  );
  const leadSection = extractSection(
    body,
    /Lead Capture|Contact Forms?|Forms?|Ordering(?:\s*&\s*Vendor)?\s*Fragmentation|Vendor Fragmentation/,
  );
  const schemaSection = extractSection(
    body,
    /Structured Data|Schema|Rich Results|Search Rich Results/,
  );
  const reputationSection = extractSection(
    body,
    /Domain\s*&\s*IP Reputation|IP Reputation|Domain Reputation|Blacklist|Blocklist/,
  );
  const reviewsSection = extractSection(body, /Reviews(?:\s*&\s*Reputation)?|Reputation/);

  // Lighthouse scores often land as "Scores — performance: 42, accessibility: 78, …"
  const lhScores = extractLighthouseScoreMap(
    [perfSection, bpSection, a11ySection, seoSection, body].join('\n'),
  );
  const scorePool = [perfSection, bpSection, a11ySection, seoSection, body].join('\n');

  const perfScore =
    extractPerformanceScore(perfSection) ??
    lhScores.performance ??
    extractNamedScore(scorePool, /performance/);
  // Agents often write "Mobile: 96 / 100 · Desktop: 96 / 100". Parse that
  // pair so we don't fall through to grade C (72) while the finding still
  // quotes near-perfect viewport scores. When an explicit accessibility
  // score is meaningfully worse than the pair, keep the lower score so the
  // card can explain what dragged the overall down.
  const a11yViewportScore = extractMobileDesktopScore(a11ySection);
  const a11yNamedScore =
    extractNamedScore(a11ySection, /accessibility/) ??
    extractBareScore(a11ySection) ??
    extractLighthouseScoreMap(a11ySection).accessibility ??
    lhScores.accessibility ??
    extractNamedScore(scorePool, /accessibility/);
  const a11yScore =
    a11yViewportScore != null &&
    a11yNamedScore != null &&
    a11yNamedScore <= a11yViewportScore - 6
      ? a11yNamedScore
      : (a11yViewportScore ?? a11yNamedScore);
  const seoScore =
    lhScores.seo ??
    extractNamedScore(seoSection, /seo/) ??
    extractBareScore(seoSection) ??
    extractNamedScore(scorePool, /seo/);

  const seoCorpus = seoSection.trim() || contentSection;
  const seoInventoryGrade = (() => {
    // Prefer explicit "SEO inventory grade: B (78/100)" from seo_inventory tool output.
    const m = seoCorpus.match(
      /SEO inventory grade:\s*([ABCDF])(?:\s*\((\d{1,3})\s*\/\s*100\))?/i,
    );
    if (m) return m[1].toUpperCase() as LetterGrade;
    const m2 = body.match(
      /SEO inventory[^\n]{0,40}grade:\s*([ABCDF])(?:\s*\((\d{1,3})\s*\/\s*100\))?/i,
    );
    if (m2) return m2[1].toUpperCase() as LetterGrade;
    return null;
  })();
  const seoInventoryScore = (() => {
    const m = `${seoCorpus}\n${body}`.match(
      /SEO inventory grade:\s*[ABCDF]\s*\((\d{1,3})\s*\/\s*100\)/i,
    );
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
    }
    return null;
  })();
  const seoFallback = (() => {
    if (seoInventoryGrade) return seoInventoryGrade;
    const lower = seoCorpus.toLowerCase();
    if (!seoCorpus.trim()) return null;
    if (
      /missing (?:og:image|open graph|robots\.txt|sitemap|favicon|manifest|canonical)|no (?:og:image|sitemap|robots\.txt|favicon)|blocks? all crawlers|noindex/.test(
        lower,
      )
    ) {
      return 'D' as LetterGrade;
    }
    if (/missing|empty|no meta|not index|duplicate title|no sitemap/.test(lower)) {
      return 'D' as LetterGrade;
    }
    if (/present|good|optimized|sitemap/.test(lower)) return 'B' as LetterGrade;
    return 'C' as LetterGrade;
  })();

  const a11yFallback = (() => {
    const lower = `${a11ySection}\n${uxSection}`.toLowerCase();
    if (!a11ySection.trim() && !/alt text|contrast|tap target|accessib|wcag/i.test(lower)) {
      return null;
    }
    // Require real failure language — bare "WCAG" / "contrast" is common in clean writeups.
    if (
      /\bfail(?:s|ed|ure)?\b|poor contrast|low contrast|missing (?:alt|label)|tap targets? (?:too small|fail)|wcag[^\n]{0,40}(?:fail|issue|error)/i.test(
        lower,
      )
    ) {
      return 'D' as LetterGrade;
    }
    if (
      /pass|good|no major|excellent|outstanding|9\d\s*\/\s*100|100\s*\/\s*100/.test(lower)
    ) {
      return 'A' as LetterGrade;
    }
    if (a11ySection.trim() || /alt text|contrast|tap target|accessib/i.test(lower)) {
      return 'C' as LetterGrade;
    }
    return null;
  })();

  // Letter grades only from the SSL section (a "Grade: F" elsewhere must not
  // poison security). No-SSL / "Not Secure" language may come from the body
  // when the agent skipped the playbook heading — that is still an F.
  const sslGrade = findLetterGrade(sslSection);
  const securityGrade = sslGrade ?? inferSecurityGrade(sslSection, body);

  // Lighthouse Best Practices is a kitchen-sink score (console noise, image
  // aspect ratios, etc.). Do not let that numeric score turn a valid
  // certificate into an F. Only fold in security-relevant BP language.
  const securityIssueGrade = securityIssueGradeFromText(`${sslSection}\n${bpSection}`);
  const securityCombinedGrade =
    worseGrade(securityGrade, securityIssueGrade) ?? securityGrade;

  const dnsCorpus =
    dnsSection.trim() ||
    body
      .split('\n')
      .filter((l) => /\b(spf|dkim|dmarc|mx\b|whois|nameserver|a record|dns)\b/i.test(l))
      .join('\n');
  const email = emailGradeFromText(dnsCorpus);
  const domain = domainGradeFromText(dnsCorpus || dnsSection);

  const presenceExtras = body
    .split('\n')
    .map((l) => stripMd(l))
    .filter((l) =>
      /google|apple\s*maps|apple\s*business|yelp|facebook|instagram|tiktok|linkedin|review|maps|listing|citation|tripadvisor|bing\s*places|social/i.test(
        l,
      ),
    );
  const presenceCorpus = [presenceSection, contentSection, reviewsSection, ...presenceExtras]
    .filter(Boolean)
    .join('\n');
  const presenceAudited = Boolean(
    presenceSection.trim() ||
      input.googlePlacesListed === false ||
      /online presence|google (?:business|maps)|apple (?:business|maps)|yelp|bing\s*places|instagram|facebook/i.test(
        body,
      ),
  );

  let gbp = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /google\s*(business|my\s*business|maps|listing|profile|place)/i,
        /\bgbp\b|\bgmb\b/i,
        /maps\.google|goo\.gl\/maps|maps\.app\.goo/i,
        /\bgoogle maps\b/i,
        /google places api/i,
      ],
      omittedAsMissing: true,
      omittedSummary: 'No Google Business listing found — local customers may not see you on Maps.',
      omittedWhy:
        'The presence check did not mention Google Business / Maps — usually means no solid listing turned up.',
    },
    presenceAudited,
  );
  if (input.googlePlacesListed === false) {
    gbp = {
      status: 'missing',
      summary: clientName
        ? `${clientName} is not listed in the Google Places API.`
        : 'Not listed in the Google Places API.',
      why: [
        'Google Places found no business match — they are not findable on Google Maps / Business Profile.',
        ...gbp.why.filter((line) => !/not covered|not called out/i.test(line)).slice(0, 2),
      ].slice(0, 4),
    };
  }
  const apple = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /apple\s*business/i,
        /apple\s*maps/i,
        /business\s*connect/i,
        /\bapple\b.*\b(maps|listing|wallet|siri)\b/i,
      ],
      omittedAsMissing: true,
      omittedSummary: clientName
        ? `Not on Apple Maps — iPhone users cannot find ${clientName} there.`
        : 'Not on Apple Maps — iPhone users cannot find them there.',
      omittedWhy:
        'Apple Business Connect / Apple Maps was not mentioned — most businesses without a Connect listing stay invisible on iPhone Maps.',
    },
    presenceAudited,
  );
  const social = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /instagram|facebook|fb\.com|tiktok|linkedin|twitter|\bx\.com\b|social(?:\s+media|\s+presence|\s+spread)?/i,
      ],
      omittedAsMissing: true,
      omittedSummary: 'Social profiles look thin or inconsistent.',
      omittedWhy:
        'The presence check did not mention healthy social profiles (Instagram, Facebook, etc.).',
    },
    presenceAudited,
  );
  const reviews = assessChannel(
    presenceCorpus,
    {
      keywords: [/reviews?|ratings?|\d(?:\.\d)?\s*stars?|yelp|reputation/i],
      omittedAsMissing: true,
      omittedSummary: clientName
        ? `Reviews are thin or not working hard enough for ${clientName}.`
        : 'Reviews are thin or not working hard enough yet.',
      omittedWhy:
        'Reviews / ratings were not mentioned in the presence notes — reputation may be thin or unchecked.',
    },
    presenceAudited,
  );
  const listings = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /yelp|bing\s*places|tripadvisor|yellow\s*pages|directories|citations?|listings?/i,
      ],
      omittedAsMissing: true,
      omittedSummary: 'Yelp / Bing Places directory listings look thin or inconsistent.',
      omittedWhy:
        'Yelp, Bing Places, or other directories were not clearly documented as healthy, matching listings.',
    },
    presenceAudited,
  );

  // One client-facing card: Google + Apple Maps + Yelp/Bing directories (coverage score, not binary).
  const localListings = combineLocalListings(
    [
      { label: 'Google Business Profile', signal: gbp, weight: 45 },
      { label: 'Apple Maps', signal: apple, weight: 30 },
      { label: 'Yelp & Bing Places', signal: listings, weight: 25 },
    ],
    clientName,
  );

  const channelCategory = (
    id: ReportCardCategoryId,
    signal: PresenceSignal,
    score?: number | null,
  ): ReportCardCategory => {
    const meta = CATEGORY_BY_ID.get(id);
    const label = meta?.label || id;
    const why = clientFriendlyBullets(signal.why, 4, clientName);
    const summary = plainLanguage(signal.summary, clientName);
    // Missing presence = 0/100 (not the mid-band F→40 placeholder).
    const resolvedScore =
      score != null && !Number.isNaN(score)
        ? score
        : signal.status === 'missing'
          ? 0
          : null;
    const grade =
      resolvedScore != null ? scoreToGrade(resolvedScore) : signalToGrade(signal);
    return {
      id,
      label,
      icon: meta?.icon || 'search',
      source: meta?.source || 'Independent platform checks',
      featured: meta?.featured,
      summary,
      finding: primaryFinding(why, summary),
      grade,
      score: resolvedScore,
      why,
      unavailable: signal.status === 'unavailable' || signal.status === 'unknown',
    };
  };

  const mobileFallback = (() => {
    // Layout grade comes only from the UX / Mobile Responsiveness section —
    // never from Lighthouse performance prose ("Mobile: 35") or a11y tap-target notes.
    const lower = uxSection.toLowerCase();
    if (!uxSection.trim()) return null;
    if (
      /not mobile[- ]friendly|fails? mobile|broken on (?:phone|mobile)|unusable on (?:phone|mobile)|horizontal (?:scroll|overflow)/.test(
        lower,
      )
    ) {
      return 'D' as LetterGrade;
    }
    if (
      /mobile[- ]friendly|responsive|adapts(?: well)?|looks good on mobile|works (?:well )?on (?:phone|mobile)/.test(
        lower,
      )
    ) {
      return 'B' as LetterGrade;
    }
    return 'C' as LetterGrade;
  })();

  /** Prefer Playwright-attributed source when the audit body cites it. */
  const mobileSourceOverride = /playwright|headless chromium|real-browser/i.test(
    `${uxSection}\n${body}`,
  )
    ? 'Playwright (headless Chromium) · real-browser mobile layout'
    : undefined;
  const leadSourceOverride = /playwright/i.test(`${leadSection}\n${uxSection}\n${body}`)
    ? 'Playwright form checks · homepage contact path review'
    : undefined;

  const heuristicSection = (
    id: ReportCardCategoryId,
    section: string,
    opts: {
      bad: RegExp;
      good: RegExp;
      present: RegExp;
      emptySummary: string;
      badGrade?: LetterGrade;
      goodGrade?: LetterGrade;
      midGrade?: LetterGrade;
    },
  ): ReportCardCategory => {
    const sectionText = section.trim();
    // Never invent a grade from body-wide keyword hits when this section is missing.
    // That produced fake B/D cards with "needs a closer look" while the real write-up
    // sat under a slightly different heading (or wasn't written at all).
    if (!sectionText) {
      const meta = CATEGORY_BY_ID.get(id)!;
      return {
        id,
        label: meta.label,
        icon: meta.icon,
        source: meta.source,
        featured: meta.featured,
        summary: opts.emptySummary,
        finding: opts.emptySummary,
        grade: null,
        score: null,
        why: [`No ${meta.label.toLowerCase()} section was written in this audit.`],
        unavailable: true,
      };
    }
    const lower = sectionText.toLowerCase();
    let grade: LetterGrade | null = null;
    // Good before bad so "not listed on blocklists" / "clean" wins over substring traps.
    if (opts.good.test(lower)) {
      grade = opts.goodGrade || 'B';
    } else if (opts.bad.test(lower)) {
      grade = opts.badGrade || 'D';
    } else if (opts.present.test(lower) || sectionText.length > 0) {
      grade = opts.midGrade || 'C';
    }
    return scoreCategory(id, null, sectionText, grade, opts.emptySummary, undefined, clientName);
  };

  const reputationCorpus =
    reputationSection.trim() ||
    body
      .split('\n')
      .filter((l) => isReputationRelevantLine(l))
      .join('\n');

  const securityWhySource =
    [
      sslSection,
      ...bulletsFromSection(bpSection).filter((line) => securityIssueGradeFromText(line)),
    ]
      .filter(Boolean)
      .join('\n') || body;
  const securityCat: ReportCardCategory = (() => {
    const meta = CATEGORY_BY_ID.get('security')!;
    const why = clientFriendlyBullets(bulletsFromSection(securityWhySource), 5, clientName);
    const grade = securityCombinedGrade;
    const score = gradeToScore(grade);
    const summary =
      grade == null
        ? 'Not scored in this audit'
        : primaryFindingForGrade(
            why,
            sslGrade
              ? `Website security graded ${sslGrade}.`
              : 'Certificate and protection checks need attention.',
            grade,
          );
    return {
      id: 'security',
      label: meta.label,
      icon: meta.icon,
      source: meta.source,
      summary,
      finding: summary,
      grade,
      score: score ?? null,
      why: why.length ? why : ['No detailed security notes in this audit.'],
      unavailable: grade == null,
    };
  })();

  const emailMeta = CATEGORY_BY_ID.get('email')!;
  const emailWhy = clientFriendlyBullets(email.why, 5, clientName);
  const emailCat: ReportCardCategory = {
    id: 'email',
    label: emailMeta.label,
    icon: emailMeta.icon,
    source: emailMeta.source,
    summary: plainLanguage(email.summary, clientName),
    finding: primaryFinding(emailWhy, plainLanguage(email.summary, clientName)),
    grade: email.grade,
    why: emailWhy,
    unavailable: email.unavailable || email.grade == null,
  };

  const domainMeta = CATEGORY_BY_ID.get('domain')!;
  const domainWhy = clientFriendlyBullets(domain.why, 4, clientName);
  const domainCat: ReportCardCategory = {
    id: 'domain',
    label: domainMeta.label,
    icon: domainMeta.icon,
    source: domainMeta.source,
    summary: plainLanguage(domain.summary, clientName),
    finding: primaryFinding(domainWhy, plainLanguage(domain.summary, clientName)),
    grade: domain.grade,
    why: domainWhy,
    unavailable: domain.grade == null,
  };

  const reputation = reputationFromText(reputationCorpus, clientName);
  const reputationMeta = CATEGORY_BY_ID.get('domain_reputation')!;
  const reputationCat: ReportCardCategory = {
    id: 'domain_reputation',
    label: reputationMeta.label,
    icon: reputationMeta.icon,
    source: reputationMeta.source,
    featured: reputationMeta.featured,
    summary: reputation.summary,
    finding: reputation.summary,
    grade: reputation.grade,
    why: reputation.why,
    unavailable: reputation.unavailable || reputation.grade == null,
  };

  const rawCategories: ReportCardCategory[] = [
    reputationCat,
    securityCat,
    domainCat,
    channelCategory('local_listings', localListings.signal, localListings.score),
    (() => {
      // Combine Lighthouse SEO with seo_inventory — missing og:image / robots / sitemap
      // should pull the grade down even when Lighthouse SEO looks fine.
      const lhGrade = scoreToGrade(seoScore);
      const invGrade = seoInventoryGrade ?? scoreToGrade(seoInventoryScore);
      const combinedGrade = worseGrade(lhGrade, invGrade) ?? seoFallback;
      const combinedScore = (() => {
        const parts = [seoScore, seoInventoryScore].filter(
          (n): n is number => n != null && !Number.isNaN(n),
        );
        if (!parts.length) return null;
        return Math.min(...parts);
      })();
      return scoreCategory(
        'seo',
        combinedScore,
        seoSection || (seoFallback ? seoCorpus : ''),
        combinedGrade,
        'Not scored in this audit',
        undefined,
        clientName,
      );
    })(),
    (() => {
      // Hosting company may appear under DNS notes (no separate Backup & Hosting tile).
      const hostBlob = `${dnsSection}\n${body}`;
      const resourceIssue =
        /server resource issue|shared\/budget hosting|underpowered/.test(hostBlob) &&
        /godaddy|blue\s*host|hostgator|hostinger|siteground|shared hosting/i.test(hostBlob);
      const perfBody =
        resourceIssue && !/server resource issue/i.test(perfSection)
          ? `${perfSection}\n- Clean build but slow — likely server resource issue on current hosting.`
          : perfSection;
      return scoreCategory(
        'performance',
        perfScore,
        perfBody,
        perfBody.trim() || perfScore != null ? 'C' : null,
        'Not scored in this audit',
        undefined,
        clientName,
      );
    })(),
    scoreCategory(
      'mobile',
      null,
      uxSection,
      mobileFallback,
      'Not scored in this audit',
      mobileSourceOverride ? { source: mobileSourceOverride } : undefined,
      clientName,
    ),
    channelCategory('reviews', reviews),
    channelCategory('social', social),
    scoreSiteTrackingCategory(
      analyticsInstallSection,
      techStackSection,
      bodyWithoutSearchAnalytics,
      clientName,
      searchAnalyticsSection,
    ),
    scoreCategory(
      'accessibility',
      a11yScore,
      a11ySection,
      a11yFallback,
      'Not scored in this audit',
      undefined,
      clientName,
    ),
    heuristicSection('broken_links', linksSection, {
      bad: /broken link|404|500\b|dead link|crawl (?:error|fail)|not crawled|empty anchors?/i,
      good: /no broken|0 broken|links (?:look |are )?healthy|crawl clean|all (?:internal and external )?links resolve/i,
      present: /broken link|check_links|crawl|404|empty anchor|redirect/i,
      emptySummary: 'Not scored in this audit',
      // Quick tier often skips crawl — don't invent a grade from "not crawled" alone as F
      badGrade: /not crawled|quick audit/i.test(linksSection) ? 'C' : 'D',
    }),
    heuristicSection('content', contentSection, {
      bad: /empty page|placeholder|lorem|outdated|thin content|no clear (?:offer|cta)|coming soon/i,
      good: /clear offer|strong (?:cta|copy)|content looks|well written/i,
      present: /content|copy|messaging|placeholder|cta/i,
      emptySummary: 'Not scored in this audit',
    }),
    (() => {
      const cat = heuristicSection('lead_capture', leadSection || contentSection, {
        bad: /no form|broken form|form (?:fails|error)|no chat|no contact|lead(?:s)? (?:lost|untracked)|fragmented ordering|multi-vendor|doordash|uber eats|grubhub|restaurantsignin|separate (?:shopify|checkout)|no clear default path/i,
        good: /form works|contact form|click.to.call|chat (?:is )?available|lead capture|single (?:owned )?ordering|chownow|unified (?:order|checkout)/i,
        present: /form|lead capture|contact form|chat widget|click.to.call|order|doordash|pickup|shopify|fragment/i,
        emptySummary: 'Not scored in this audit',
        badGrade: /fragmented ordering|multi-vendor|doordash.*uber|grubhub.*pickup/i.test(
          `${leadSection}\n${contentSection}`,
        )
          ? 'F'
          : 'D',
      });
      if (leadSourceOverride) cat.source = leadSourceOverride;
      return cat;
    })(),
    heuristicSection('schema', schemaSection || seoSection, {
      bad: /no schema|missing (?:schema|structured data|json-?ld)|no (?:localbusiness|rich results)|types:\s*none/i,
      good: /schema present|structured data|localbusiness|json-?ld|rich results/i,
      present: /schema|structured data|json-?ld|rich results|localbusiness|seo_inventory/i,
      emptySummary: 'Not scored in this audit',
    }),
    emailCat,
  ];

  // Don't show empty "—" rows to clients — only graded / available categories.
  // Align score↔grade so the ring, letter, and bars never contradict each other.
  const categories = rawCategories
    .filter((c) => c.grade && !c.unavailable)
    .map(finalizeCategory);

  const featured =
    categories.find((c) => c.id === 'domain_reputation' && c.featured) ||
    categories.find((c) => c.featured) ||
    null;
  const gridCategories = (featured
    ? categories.filter((c) => c.id !== featured.id)
    : categories
  )
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  const overallScore =
    categories.length > 0
      ? Math.round(
          categories
            .map((c) => c.score ?? gradeToScore(c.grade) ?? 0)
            .reduce((a, b) => a + b, 0) / categories.length,
        )
      : null;
  const overall = scoreToGrade(overallScore);

  const actionItems = extractActionItems(body).filter((item) => !isAgencyAnalyticsClientLeak(item));
  const ideas = buildIdeas(rawCategories, body, actionItems);
  const potential = improveGrade(overall, ideas.length >= 3 || actionItems.length >= 4 ? 2 : 1);
  const criticalCount = categories.filter((c) => c.grade === 'F').length;

  const headline = buildDiagnosticHeadline(categories, overall, clientName);
  const heroStats = buildHeroStats(categories, criticalCount, domainWhy, clientName);

  return {
    isAudit: true,
    inProgress: false,
    title: input.title || 'Website audit',
    website: extractWebsiteLine(body) || extractAuditWebsite(input.website),
    headline,
    heroStats,
    overall,
    featured,
    categories: gridCategories,
    ideas,
    actionItems,
    potential,
    overallScore,
    potentialScore: gradeToScore(potential),
    criticalCount,
  };
}

function categoryEffectiveScore(cat: ReportCardCategory): number {
  if (cat.score != null && !Number.isNaN(cat.score)) return cat.score;
  return gradeToScore(cat.grade) ?? 100;
}

function worstWeakCategory(categories: ReportCardCategory[]): ReportCardCategory | null {
  const weak = categories.filter((c) => c.grade === 'D' || c.grade === 'F');
  if (!weak.length) return null;
  return weak.slice().sort((a, b) => {
    const scoreDiff = categoryEffectiveScore(a) - categoryEffectiveScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    return (GRADE_RANK[a.grade!] ?? 0) - (GRADE_RANK[b.grade!] ?? 0);
  })[0]!;
}

function headlineForWeakCategory(cat: ReportCardCategory, clientName = ''): string {
  const name = clientName.trim();
  switch (cat.id) {
    case 'local_listings':
      if (cat.score != null && cat.score <= 0) {
        return name
          ? `${name} is invisible where local customers actually search.`
          : 'Invisible where local customers actually search.';
      }
      return name
        ? `${name} is hard to find where local customers actually search.`
        : 'Hard to find where local customers actually search.';
    case 'social':
      return name
        ? `${name} is quiet where customers look for a brand.`
        : 'Quiet where customers look for a brand.';
    case 'performance':
    case 'mobile':
      return 'The site is costing attention before customers ever reach the offer.';
    case 'security':
    case 'email':
    case 'domain_reputation':
      return name
        ? `Trust signals are soft — customers and inboxes may not believe ${name}.`
        : 'Trust signals are soft — customers and inboxes may not believe the brand.';
    case 'reviews':
      return 'Reputation is not doing enough work to win the next customer.';
    case 'seo':
    case 'schema':
      return name
        ? `${name} is harder to discover in search than it should be.`
        : 'Harder to discover in search than it should be.';
    case 'domain':
      return 'Domain or DNS issues could take the site or email offline.';
    case 'analytics':
      return 'There is no clear picture of which visits turn into customers.';
    case 'broken_links':
      return 'Broken pages and links are leaking trust and search visibility.';
    case 'content':
    case 'lead_capture':
      return 'The site is not converting visitors into leads as well as it could.';
    case 'accessibility':
      return 'Accessibility gaps mean some customers struggle to use the site.';
    default:
      return name
        ? `${name}'s online presence has a weak spot in ${cat.label.toLowerCase()}.`
        : `A weak spot showed up in ${cat.label.toLowerCase()}.`;
  }
}

function buildDiagnosticHeadline(
  categories: ReportCardCategory[],
  overall: LetterGrade | null,
  clientName = '',
): string {
  const name = clientName.trim();
  const weak = categories.filter((c) => c.grade === 'D' || c.grade === 'F');

  if (weak.length >= 3) {
    const worst = worstWeakCategory(weak);
    const scores = weak.map(categoryEffectiveScore);
    const minScore = Math.min(...scores);
    const tiedAtWorst = scores.filter((s) => s === minScore).length;
    if (worst && tiedAtWorst === 1) {
      return headlineForWeakCategory(worst, clientName);
    }
    return 'Several core systems need attention before growth work will stick.';
  }

  const worst = worstWeakCategory(weak);
  if (worst) return headlineForWeakCategory(worst, clientName);

  if (overall === 'A' || overall === 'B') {
    return 'The foundation looks solid — a few focused fixes would still raise the grade.';
  }
  if (overall === 'C') {
    return 'The online presence works in places, but gaps are leaving money on the table.';
  }
  return name
    ? `A plain-language look at how ${name} shows up online.`
    : 'A plain-language look at the online presence.';
}

function buildHeroStats(
  categories: ReportCardCategory[],
  criticalCount: number,
  domainWhy: string[],
  clientName = '',
): Array<{ label: string; tone: 'crit' | 'risk' | 'info' }> {
  const stats: Array<{ label: string; tone: 'crit' | 'risk' | 'info' }> = [];
  const total = categories.length;
  if (criticalCount > 0 && total > 0) {
    stats.push({
      label: `${criticalCount} of ${total} systems in critical failure`,
      tone: 'crit',
    });
  }
  const renew = domainWhy.find((w) => /renew|expir|auto-?renew/i.test(w));
  if (renew) {
    stats.push({
      label: plainLanguage(renew, clientName).slice(0, 72),
      tone: 'risk',
    });
  }
  stats.push({
    label: 'Every finding sourced from independent platforms',
    tone: 'info',
  });
  return stats.slice(0, 3);
}

export function reportCardCategoryMeta(): typeof CATEGORY_META {
  return CATEGORY_META;
}
