/**
 * Parse website-audit markdown (playbook body) into a client-facing report card.
 * Does not re-run audits — filters existing Work job body for the portal UI.
 *
 * Admin keeps the raw markdown. This module only shapes the client diagnostic:
 * plain-language findings, scores, and sources — no jargon dump.
 */

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Diagnostic categories shown to clients (mockup 13 + monetizable extras).
 * `best_practices` / `presence` remain parseable from older markdown but are
 * folded into security / social for the client view.
 */
export type ReportCardCategoryId =
  | 'domain_reputation'
  | 'security'
  | 'domain'
  | 'google_business'
  | 'apple_business'
  | 'seo'
  | 'performance'
  | 'mobile'
  | 'reviews'
  | 'social'
  | 'analytics'
  | 'accessibility'
  | 'hosting'
  | 'broken_links'
  | 'content'
  | 'lead_capture'
  | 'schema'
  | 'email'
  /** @deprecated folded into security — kept for older markdown / LH scores */
  | 'best_practices'
  /** @deprecated folded into social — kept for older markdown */
  | 'presence';

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
    source: 'Certificate & browser security checks',
  },
  {
    id: 'domain',
    label: 'Domain & DNS Health',
    icon: 'globe',
    source: 'Domain registration · DNS lookup',
  },
  {
    id: 'google_business',
    label: 'Google Business Profile',
    icon: 'pin',
    source: 'Google Business Profile',
  },
  {
    id: 'apple_business',
    label: 'Apple Business Connect',
    icon: 'compass',
    source: 'Apple Business Connect',
  },
  {
    id: 'seo',
    label: 'SEO Fundamentals',
    icon: 'search',
    source: 'Search visibility checks',
  },
  {
    id: 'performance',
    label: 'Site Speed & Performance',
    icon: 'speed',
    source: 'Google PageSpeed Insights',
  },
  {
    id: 'mobile',
    label: 'Mobile Responsiveness',
    icon: 'mobile',
    source: 'Mobile layout checks',
  },
  {
    id: 'reviews',
    label: 'Reviews & Reputation',
    icon: 'star',
    source: 'Google · Yelp · major review sites',
  },
  {
    id: 'social',
    label: 'Social Spread',
    icon: 'share',
    source: 'Social profiles · local directories',
  },
  {
    id: 'analytics',
    label: 'Analytics & Conversion Tracking',
    icon: 'chart',
    source: 'Analytics & conversion checks',
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    icon: 'access',
    source: 'Accessibility (WCAG) checks',
  },
  {
    id: 'hosting',
    label: 'Backup & Hosting Reliability',
    icon: 'cloud',
    source: 'Hosting & backup signals',
  },
  {
    id: 'broken_links',
    label: 'Broken Links & Crawl Health',
    icon: 'link',
    source: 'Site crawl',
  },
  {
    id: 'content',
    label: 'Content & Messaging',
    icon: 'content',
    source: 'Homepage & page content review',
  },
  {
    id: 'lead_capture',
    label: 'Lead Capture',
    icon: 'lead',
    source: 'Forms & contact paths',
  },
  {
    id: 'schema',
    label: 'Search Rich Results',
    icon: 'schema',
    source: 'Structured data / rich results',
  },
  {
    id: 'email',
    label: 'Email Deliverability',
    icon: 'mail',
    source: 'Email authentication checks',
  },
];

const CATEGORY_BY_ID = new Map(CATEGORY_META.map((c) => [c.id, c]));

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
  return section
    .split('\n')
    .map((line) => stripMd(line))
    .filter((line) => line.length > 0 && !/^#{1,6}\s/.test(line) && line !== '---');
}

function extractSection(body: string, heading: RegExp): string {
  // Wrap alternations so `|` cannot escape the heading atom.
  // Accept ## / ### / #### and bold-only headings agents sometimes write.
  const re = new RegExp(
    `(?:^|\\n)(?:#{2,4}\\s+(?:${heading.source})\\s*|\\*\\*(?:${heading.source})\\*\\*\\s*)\\n([\\s\\S]*?)(?=\\n(?:#{2,4}\\s+|\\*\\*[^*]+\\*\\*\\s*$)|$)`,
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

/** Prefer explicit mobile/desktop performance scores; average when both exist. */
function extractPerformanceScore(text: string): number | null {
  const mobile = findNumber(text, [
    /mobile[^\n]{0,80}?performance\s*[:=]\s*(\d{1,3})/i,
    /mobile(?:\s+performance|\s+perf(?:ormance)?\s*score)?\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?mobile[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  const desktop = findNumber(text, [
    /desktop[^\n]{0,80}?performance\s*[:=]\s*(\d{1,3})/i,
    /desktop(?:\s+performance|\s+perf(?:ormance)?\s*score)?\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?desktop[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  const generic = findNumber(text, [
    /(?:scores?[^\n]{0,60})?\bperformance\s*[:=]\s*(\d{1,3})/i,
    /(?:performance|perf(?:ormance)?\s*score)\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?(\d{1,3})\s*\/\s*100/i,
  ]);
  const vals = [mobile, desktop, generic].filter(
    (n, i, arr): n is number => n != null && arr.indexOf(n) === i,
  );
  if (!vals.length) return null;
  if (vals.length === 1) return vals[0];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
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
  const why = hits.slice(0, 4);

  if (
    /unavailable|quota exceeded|data unavailable|could not (?:check|verify|find)|search quota/.test(
      joined,
    )
  ) {
    return { status: 'unavailable', summary: 'Could not verify right now', why };
  }

  // Missing only when the *matched* snippet itself denies the listing.
  const missingHit = hits.some((h) =>
    /not (?:found|claimed|listed|set up|configured|verified|confirmed)|no confirmed|no (?:clear\s+)?(?:listing|profile|page|presence)|(?:no|not)\s+(?:on\s+)?(?:apple|google)|missing|none found|does not (?:appear|exist)|invisible|unlisted|no clear\b|critical gap/i.test(
      h,
    ),
  );
  // If some hits are positive and one is negative, prefer weak/ok from the positive ones.
  const positiveHit = hits.some((h) =>
    /found|claimed|active|verified|complete|appears|shows up|listing|maps pin|reviews?|stars?/i.test(
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

  return { status: 'weak', summary: 'Needs a closer look', why };
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
      why: bulletsFromSection(text).slice(0, 4),
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
      why: bulletsFromSection(text).slice(0, 4),
    };
  }

  const passes = known.filter((x) => x === 'pass').length;
  const ratio = passes / known.length;
  const grade: LetterGrade =
    ratio >= 1 ? 'A' : ratio >= 0.67 ? 'C' : ratio >= 0.34 ? 'D' : 'F';
  const labels = [
    `SPF: ${spf === 'unknown' ? 'not checked' : spf}`,
    `DKIM: ${dkim === 'unknown' ? 'not checked' : dkim}`,
    `DMARC: ${dmarc === 'unknown' ? 'not checked' : dmarc}`,
  ];
  return {
    grade,
    summary:
      grade === 'A'
        ? 'Authentication looks complete'
        : 'Email authentication gaps',
    why: [...labels, ...bulletsFromSection(text).slice(0, 3)],
  };
}

function domainGradeFromText(text: string): {
  grade: LetterGrade | null;
  summary: string;
  why: string[];
} {
  const why = bulletsFromSection(text).slice(0, 4);
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
      return { grade: 'C', summary: 'DNS needs a closer look', why };
    }
    return { grade: 'B', summary: 'Domain resolves', why };
  }
  return { grade: 'C', summary: 'Domain notes on file', why };
}

/** Soften technical jargon into money-relevant plain language for clients. */
function plainLanguage(line: string): string {
  return line
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
    .trim();
}

function clientFriendlyBullets(lines: string[], limit = 4): string[] {
  return lines
    .map((line) => plainLanguage(line))
    .filter((line) => line.length > 2)
    .slice(0, limit);
}

/** First usable finding sentence for a category card. */
function primaryFinding(why: string[], fallback: string): string {
  const first = why.find((w) => w.length > 12) || why[0];
  if (!first) return fallback;
  // Cap so cards stay scannable.
  return first.length > 180 ? `${first.slice(0, 177).trim()}…` : first;
}

/** Prefer a finding that matches a weak/failing grade instead of a rosy first bullet. */
function primaryFindingForGrade(
  why: string[],
  fallback: string,
  grade: LetterGrade | null,
): string {
  if (grade === 'D' || grade === 'F') {
    const negative = why.find((w) =>
      /missing|fail|expired|invalid|critical|no confirmed|not found|weak|risk|error|insecure|broken|none|gap/i.test(
        w,
      ),
    );
    if (negative) return primaryFinding([negative], fallback);
  }
  return primaryFinding(why, fallback);
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

function extractWebsiteLine(body: string): string | undefined {
  const m = body.match(/\*\*Current Website:\*\*\s*(.+)/i);
  if (!m) return undefined;
  return stripMd(m[1]).slice(0, 120);
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
    problem: (cat) =>
      cat.score != null
        ? `The site scores ${cat.score}/100 on speed — people on phones will leave before it loads.`
        : 'The site feels slow, especially on phones.',
    solution: 'Speed fix: compress images, cut heavy scripts, and tune hosting so pages open fast.',
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
    problem: () => 'Search visibility is weaker than it should be for a local business.',
    solution: 'Local SEO package: clearer titles, descriptions, and Google Business alignment.',
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
    id: 'gbp',
    categoryId: 'google_business',
    categoryLabel: 'Google Business',
    maxRank: 3,
    problem: (cat) =>
      cat.grade === 'F'
        ? 'No solid Google Business Profile — many local customers search Maps first.'
        : 'Google Business Profile needs attention (hours, photos, or claim status).',
    solution: 'Claim and optimize Google Business so Maps and local search work for you.',
  },
  {
    id: 'apple',
    categoryId: 'apple_business',
    categoryLabel: 'Apple Maps',
    maxRank: 3,
    problem: (cat) =>
      cat.grade === 'F'
        ? 'Invisible on Apple Maps — iPhone users cannot find you there.'
        : 'Apple Maps listing looks incomplete or unverified.',
    solution: 'Apple Business Connect setup so iPhone customers can find you.',
  },
  {
    id: 'social',
    categoryId: 'social',
    categoryLabel: 'Social Spread',
    maxRank: 3,
    problem: () => 'Name, address, or phone do not match across the web — or social is quiet.',
    solution: 'Listings & social cleanup so every directory points to the same business.',
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
    maxRank: 3,
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
    id: 'hosting',
    categoryId: 'hosting',
    categoryLabel: 'Hosting',
    maxRank: 3,
    problem: () => 'No clear backup plan — a hosting glitch could take the site offline for good.',
    solution: 'Hosting & automated backups so recovery is measured in minutes, not days.',
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
  const authored = extractAuthoredIdeas(body);
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
    } else if (/google business|gbp|maps/.test(lower)) {
      categoryId = 'google_business';
      categoryLabel = 'Google Business';
    } else if (/apple/.test(lower)) {
      categoryId = 'apple_business';
      categoryLabel = 'Apple Maps';
    } else if (/ssl|security|header|padlock|https/.test(lower)) {
      categoryId = 'security';
      categoryLabel = 'Security';
    } else if (/spf|dkim|dmarc|email|spam|inbox/.test(lower)) {
      categoryId = 'email';
      categoryLabel = 'Email';
    } else if (/review/.test(lower)) {
      categoryId = 'reviews';
      categoryLabel = 'Reviews';
    } else if (/social|instagram|facebook|citation|listing|directory|nap/.test(lower)) {
      categoryId = 'social';
      categoryLabel = 'Social Spread';
    } else if (/mobile|responsive|tap target/.test(lower)) {
      categoryId = 'mobile';
      categoryLabel = 'Mobile';
    } else if (/analytics|conversion|tracking|ga4/.test(lower)) {
      categoryId = 'analytics';
      categoryLabel = 'Tracking';
    } else if (/backup|hosting|uptime/.test(lower)) {
      categoryId = 'hosting';
      categoryLabel = 'Hosting';
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
): ReportCardCategory {
  const meta = CATEGORY_BY_ID.get(id);
  const label = overrides?.label || meta?.label || id;
  const grade = scoreToGrade(score) ?? fallbackGrade;
  const why = clientFriendlyBullets(bulletsFromSection(section), 5);
  const summary =
    grade == null
      ? section.trim()
        ? `${label} notes on file`
        : emptySummary
      : primaryFinding(
          why,
          score != null ? `${label} scored ${score}/100.` : `${label} needs a closer look.`,
        );
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

export function isAuditJob(input: {
  tags?: string[] | null;
  source?: string | null;
  title?: string | null;
  body?: string | null;
}): boolean {
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
}): AuditReportCard | null {
  const body = (input.body || '').trim();
  if (!isAuditJob({ ...input, body })) return null;

  const inProgress =
    /siri audit in progress/i.test(body) ||
    /^Auditing\b/i.test(input.title || '') ||
    (body.length < 400 && /research agent is locating/i.test(body));

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
  const seoSection = extractSection(body, /SEO(?:\s+Fundamentals)?|Search(?:\s+Fundamentals)?/);
  const a11ySection = extractSection(body, /Accessibility(?:\s*\(WCAG\))?/);
  const bpSection = extractSection(body, /Best Practices|Best\-Practices/);
  const sslSection = extractSection(body, /SSL\s*&\s*(?:Website\s+)?Security|Website Security|Security|SSL/);
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
  const analyticsSection = extractSection(
    body,
    /Analytics(?:\s*&\s*Conversion(?:\s+Tracking)?)?|Conversion Tracking|Tracking/,
  );
  const hostingSection = extractSection(
    body,
    /Backup(?:\s*&\s*Hosting(?:\s+Reliability)?)?|Hosting(?:\s+Reliability)?|Uptime/,
  );
  const linksSection = extractSection(body, /Broken Links(?:\s*&\s*Crawl Health)?|Crawl Health|Links/);
  const leadSection = extractSection(body, /Lead Capture|Contact Forms?|Forms?/);
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
  const a11yScore =
    lhScores.accessibility ??
    extractNamedScore(a11ySection, /accessibility/) ??
    extractBareScore(a11ySection) ??
    extractNamedScore(scorePool, /accessibility/);
  const bpScore =
    lhScores.best_practices ??
    extractNamedScore(bpSection, /best[-\s]?practices?/) ??
    extractBareScore(bpSection) ??
    extractNamedScore(scorePool, /best[-\s]?practices?/);
  const seoScore =
    lhScores.seo ??
    extractNamedScore(seoSection, /seo/) ??
    extractBareScore(seoSection) ??
    extractNamedScore(scorePool, /seo/);

  const seoCorpus = seoSection.trim() || contentSection;
  const seoFallback = (() => {
    const lower = seoCorpus.toLowerCase();
    if (!seoCorpus.trim()) return null;
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
    if (/pass|good|no major|excellent|100\s*\/\s*100/.test(lower)) return 'A' as LetterGrade;
    if (a11ySection.trim() || /alt text|contrast|tap target|accessib/i.test(lower)) {
      return 'C' as LetterGrade;
    }
    return null;
  })();

  const bpFallback = (() => {
    const text = `${bpSection}\n${sslSection}\n${uxSection}`;
    const lower = text.toLowerCase();
    if (/console error|mixed content|deprecated|not fully secure/.test(lower)) {
      return 'D' as LetterGrade;
    }
    if (bpSection.trim()) {
      if (/fail|error/.test(lower)) return 'D' as LetterGrade;
      if (/pass|good|solid/.test(lower)) return 'B' as LetterGrade;
      return 'C' as LetterGrade;
    }
    if (/missing .+ header|mixed.content/.test(sslSection.toLowerCase())) {
      return 'D' as LetterGrade;
    }
    if (/ssl|certificate|valid|https/.test(sslSection.toLowerCase())) {
      return 'C' as LetterGrade;
    }
    return null;
  })();

  // Only read SSL letter grades from the SSL section — never the whole body
  // (otherwise an unrelated "Grade: F" elsewhere poisons website security).
  const sslGrade = findLetterGrade(sslSection);
  const securityGrade =
    sslGrade ??
    (() => {
      const lower = sslSection.toLowerCase();
      if (!sslSection.trim() && !/\bssl\b|certificate|https|security header/i.test(body)) {
        return null;
      }
      if (!sslSection.trim()) return null;
      if (/expired|not trusted|invalid|http,? not https/.test(lower)) return 'F' as LetterGrade;
      if (/missing .+ header|mixed.content|not fully secure/.test(lower)) {
        return 'D' as LetterGrade;
      }
      if (/valid|ok|looks good|certificate is valid/.test(lower)) return 'B' as LetterGrade;
      return 'C' as LetterGrade;
    })();

  const bpGrade = bpScore != null ? scoreToGrade(bpScore) : bpFallback;
  // Security = worse of certificate/headers vs Best Practices (aligned score below).
  const securityCombinedGrade = worseGrade(securityGrade, bpGrade) ?? securityGrade ?? bpGrade;

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
      /online presence|google (?:business|maps)|apple (?:business|maps)|yelp|instagram|facebook/i.test(
        body,
      ),
  );

  const gbp = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /google\s*(business|my\s*business|maps|listing|profile|place)/i,
        /\bgbp\b|\bgmb\b/i,
        /maps\.google|goo\.gl\/maps|maps\.app\.goo/i,
        /\bgoogle maps\b/i,
      ],
      omittedAsMissing: true,
      omittedSummary: 'No Google Business listing found — local customers may not see you on Maps.',
      omittedWhy:
        'The presence check did not mention Google Business / Maps — usually means no solid listing turned up.',
    },
    presenceAudited,
  );
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
      omittedSummary: 'Not on Apple Maps — iPhone users cannot find this business there.',
      omittedWhy:
        'Apple Business Connect / Apple Maps was not mentioned — most businesses without a Connect listing stay invisible on iPhone Maps.',
    },
    presenceAudited,
  );
  const social = assessChannel(
    presenceCorpus,
    {
      keywords: [
        /instagram|facebook|fb\.com|tiktok|linkedin|twitter|\bx\.com\b|social(?:\s+media|\s+presence|\s+spread)?|citation|directories|listings?/i,
      ],
      omittedAsMissing: true,
      omittedSummary: 'Social profiles and directories look thin or inconsistent.',
      omittedWhy:
        'The presence check did not mention healthy social profiles or matching directory listings.',
    },
    presenceAudited,
  );
  const reviews = assessChannel(
    presenceCorpus,
    {
      keywords: [/reviews?|ratings?|\d(?:\.\d)?\s*stars?|yelp|reputation/i],
      omittedAsMissing: true,
      omittedSummary: 'Reviews are thin or not working hard enough for the business.',
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
      omittedSummary: 'Directory listings look thin or inconsistent.',
      omittedWhy:
        'Other directories were not clearly documented as healthy, matching listings.',
    },
    presenceAudited,
  );

  // Merge listings signal into social (Social Spread) for the client view.
  const socialMerged: PresenceSignal = (() => {
    if (social.status === 'unavailable' && listings.status !== 'unavailable') return listings;
    if (listings.status === 'missing' || listings.status === 'weak') {
      if (social.status === 'strong' || social.status === 'ok') {
        return {
          status: 'weak' as const,
          summary: 'Social or directory listings need cleanup — name, address, or phone may not match.',
          why: [...social.why, ...listings.why].slice(0, 4),
        };
      }
      return {
        status: listings.status,
        summary: listings.summary,
        why: [...listings.why, ...social.why].slice(0, 4),
      };
    }
    return social;
  })();

  const channelCategory = (
    id: ReportCardCategoryId,
    signal: PresenceSignal,
  ): ReportCardCategory => {
    const meta = CATEGORY_BY_ID.get(id);
    const label = meta?.label || id;
    const why = clientFriendlyBullets(signal.why, 4);
    const summary = plainLanguage(signal.summary);
    return {
      id,
      label,
      icon: meta?.icon || 'search',
      source: meta?.source || 'Independent platform checks',
      featured: meta?.featured,
      summary,
      finding: primaryFinding(why, summary),
      grade: signalToGrade(signal),
      why,
      unavailable: signal.status === 'unavailable' || signal.status === 'unknown',
    };
  };

  const mobileFallback = (() => {
    const lower = `${uxSection}\n${perfSection}\n${a11ySection}`.toLowerCase();
    if (!uxSection.trim() && !/mobile|responsive|tap target|viewport/i.test(lower)) return null;
    if (/not mobile|fails? mobile|broken on (?:phone|mobile)|overflow|tap target/.test(lower)) {
      return 'D' as LetterGrade;
    }
    if (/mobile[- ]friendly|responsive|adapts well|looks good on mobile/.test(lower)) {
      return 'B' as LetterGrade;
    }
    return uxSection.trim() || /mobile|responsive/i.test(lower) ? ('C' as LetterGrade) : null;
  })();

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
    const lower = section.toLowerCase();
    const hasSignal = section.trim().length > 0 || opts.present.test(body);
    let grade: LetterGrade | null = null;
    if (hasSignal) {
      // Prefer the section text — scanning the whole body causes false D/F grades
      // (e.g. "blocklists" in a clean writeup, or unrelated failures elsewhere).
      const haystack = section.trim() ? lower : body.toLowerCase();
      // Good before bad so "not listed on blocklists" / "clean" wins over substring traps.
      if (opts.good.test(haystack)) {
        grade = opts.goodGrade || 'B';
      } else if (opts.bad.test(haystack)) {
        grade = opts.badGrade || 'D';
      } else if (section.trim() || opts.present.test(body)) {
        grade = opts.midGrade || 'C';
      }
    }
    return scoreCategory(id, null, section, grade, opts.emptySummary);
  };

  const reputationCorpus =
    reputationSection.trim() ||
    body
      .split('\n')
      .filter((l) => /reputation|blacklist|blocklist|spamhaus|safe browsing|flagged|subnet/i.test(l))
      .join('\n');

  const securityWhySource = [sslSection, bpSection].filter(Boolean).join('\n') || body;
  const securityCat: ReportCardCategory = (() => {
    const meta = CATEGORY_BY_ID.get('security')!;
    const why = clientFriendlyBullets(bulletsFromSection(securityWhySource), 5);
    const grade = securityCombinedGrade;
    const scoreParts: number[] = [];
    if (securityGrade) {
      const s = gradeToScore(securityGrade);
      if (s != null) scoreParts.push(s);
    }
    if (bpScore != null) scoreParts.push(bpScore);
    else if (bpGrade) {
      const s = gradeToScore(bpGrade);
      if (s != null) scoreParts.push(s);
    }
    const score =
      scoreParts.length > 0
        ? Math.min(...scoreParts) // match worseGrade — don't let a strong BP lift a weak cert
        : gradeToScore(grade);
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
  const emailWhy = clientFriendlyBullets(email.why, 5);
  const emailCat: ReportCardCategory = {
    id: 'email',
    label: emailMeta.label,
    icon: emailMeta.icon,
    source: emailMeta.source,
    summary: plainLanguage(email.summary),
    finding: primaryFinding(emailWhy, plainLanguage(email.summary)),
    grade: email.grade,
    why: emailWhy,
    unavailable: email.unavailable || email.grade == null,
  };

  const domainMeta = CATEGORY_BY_ID.get('domain')!;
  const domainWhy = clientFriendlyBullets(domain.why, 4);
  const domainCat: ReportCardCategory = {
    id: 'domain',
    label: domainMeta.label,
    icon: domainMeta.icon,
    source: domainMeta.source,
    summary: plainLanguage(domain.summary),
    finding: primaryFinding(domainWhy, plainLanguage(domain.summary)),
    grade: domain.grade,
    why: domainWhy,
    unavailable: domain.grade == null,
  };

  const rawCategories: ReportCardCategory[] = [
    heuristicSection('domain_reputation', reputationCorpus, {
      bad: /\b(?:black|block)listed\b|listed on .{0,40}\b(?:black|block)lists?\b|flagged|spamhaus|poor reputation|trending down|not trusted/i,
      good: /clean|good reputation|not (?:listed|blacklisted)|clear/i,
      present: /reputation|blacklist|blocklist|spamhaus|safe browsing/i,
      emptySummary: 'Not scored in this audit',
      badGrade: 'D',
      goodGrade: 'B',
      midGrade: 'C',
    }),
    securityCat,
    domainCat,
    channelCategory('google_business', gbp),
    channelCategory('apple_business', apple),
    scoreCategory(
      'seo',
      seoScore,
      seoSection || (seoFallback ? seoCorpus : ''),
      seoFallback,
      'Not scored in this audit',
    ),
    scoreCategory(
      'performance',
      perfScore,
      perfSection,
      perfSection.trim() || perfScore != null ? 'C' : null,
      'Not scored in this audit',
    ),
    scoreCategory(
      'mobile',
      null,
      uxSection || (mobileFallback ? `${a11ySection}\n${perfSection}` : ''),
      mobileFallback,
      'Not scored in this audit',
    ),
    channelCategory('reviews', reviews),
    channelCategory('social', socialMerged),
    heuristicSection('analytics', analyticsSection, {
      bad: /no analytics|missing analytics|not (?:installed|configured)|no conversion|untracked|no goals/i,
      good: /analytics (?:is )?installed|goals? configured|tracking (?:is )?working|ga4/i,
      present: /analytics|conversion|gtm|ga4|tag manager|tracking/i,
      emptySummary: 'Not scored in this audit',
    }),
    scoreCategory(
      'accessibility',
      a11yScore,
      a11ySection,
      a11yFallback,
      'Not scored in this audit',
    ),
    heuristicSection('hosting', hostingSection, {
      bad: /no (?:automated )?backup|single point of failure|no uptime|hosting (?:risk|issue)/i,
      good: /backup(?:s)? (?:enabled|scheduled|running)|uptime|redundant|reliable hosting/i,
      present: /backup|hosting|uptime|server/i,
      emptySummary: 'Not scored in this audit',
    }),
    heuristicSection('broken_links', linksSection, {
      bad: /broken link|404|dead link|crawl (?:error|fail)|not crawled/i,
      good: /no broken|0 broken|links (?:look |are )?healthy|crawl clean/i,
      present: /broken link|check_links|crawl|404/i,
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
    heuristicSection('lead_capture', leadSection || contentSection, {
      bad: /no form|broken form|form (?:fails|error)|no chat|no contact|lead(?:s)? (?:lost|untracked)/i,
      good: /form works|contact form|click.to.call|chat (?:is )?available|lead capture/i,
      present: /form|lead capture|contact form|chat widget|click.to.call/i,
      emptySummary: 'Not scored in this audit',
    }),
    heuristicSection('schema', schemaSection || seoSection, {
      bad: /no schema|missing (?:schema|structured data)|no (?:localbusiness|rich results)/i,
      good: /schema present|structured data|localbusiness|rich results/i,
      present: /schema|structured data|json-?ld|rich results|localbusiness/i,
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

  const actionItems = extractActionItems(body);
  const ideas = buildIdeas(rawCategories, body, actionItems);
  const potential = improveGrade(overall, ideas.length >= 3 || actionItems.length >= 4 ? 2 : 1);
  const criticalCount = categories.filter((c) => c.grade === 'F').length;

  const headline = buildDiagnosticHeadline(categories, overall);
  const heroStats = buildHeroStats(categories, criticalCount, domainWhy);

  return {
    isAudit: true,
    inProgress: false,
    title: input.title || 'Website audit',
    website: extractWebsiteLine(body),
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

function buildDiagnosticHeadline(
  categories: ReportCardCategory[],
  overall: LetterGrade | null,
): string {
  const weak = categories.filter((c) => c.grade === 'D' || c.grade === 'F');
  const has = (id: ReportCardCategoryId) => weak.some((c) => c.id === id);
  if (has('google_business') && has('apple_business')) {
    return 'This business is hard to find where local customers actually search.';
  }
  if (has('google_business') || has('apple_business') || has('social')) {
    return 'This business is invisible where it matters most.';
  }
  if (has('performance') || has('mobile')) {
    return 'The site is costing attention before customers ever reach the offer.';
  }
  if (has('security') || has('email') || has('domain_reputation')) {
    return 'Trust signals are soft — customers and inboxes may not believe this business.';
  }
  if (has('reviews')) {
    return 'Reputation is not doing enough work to win the next customer.';
  }
  if (weak.length >= 3) {
    return 'Several core systems need attention before growth work will stick.';
  }
  if (overall === 'A' || overall === 'B') {
    return 'The foundation looks solid — a few focused fixes would still raise the grade.';
  }
  if (overall === 'C') {
    return 'The online presence works in places, but gaps are leaving money on the table.';
  }
  return 'A plain-language look at how this business shows up online.';
}

function buildHeroStats(
  categories: ReportCardCategory[],
  criticalCount: number,
  domainWhy: string[],
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
      label: plainLanguage(renew).slice(0, 72),
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
