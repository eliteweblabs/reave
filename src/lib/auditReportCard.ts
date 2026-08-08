/**
 * Parse website-audit markdown (playbook body) into a client-facing report card.
 * Does not re-run audits — filters existing Work job body for the portal UI.
 */

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Lighthouse’s four categories first, then presence / infra rows. */
export type ReportCardCategoryId =
  | 'performance'
  | 'accessibility'
  | 'best_practices'
  | 'seo'
  | 'security'
  | 'email'
  | 'domain'
  | 'google_business'
  | 'apple_business'
  | 'social'
  | 'reviews'
  | 'presence';

export interface ReportCardCategory {
  id: ReportCardCategoryId;
  label: string;
  /** Short plain-language blurb for the closed row. */
  summary: string;
  grade: LetterGrade | null;
  /** Why this grade — client-friendly bullets (accordion body). */
  why: string[];
  /** Optional 0–100 score when derived from Lighthouse / similar. */
  score?: number | null;
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
  overall: LetterGrade | null;
  categories: ReportCardCategory[];
  /** Promoted service opportunities (problem → solution). */
  ideas: ReportCardIdea[];
  /** Checkbox action items from the audit body. */
  actionItems: string[];
  /** Suggested letter after recommended work (optimistic, for graphics). */
  potential: LetterGrade | null;
  /** 0–100 fill for the overall ring (derived from letter). */
  overallScore: number | null;
  potentialScore: number | null;
}

const AUDIT_TAG_RE = /^(siri-audit|quick-audit|full-audit)$/i;
const AUDIT_HEADING_RE =
  /(?:website|online presence|ssl|seo|lighthouse).{0,40}audit|siri audit in progress/i;

const CATEGORY_META: {
  id: ReportCardCategoryId;
  label: string;
}[] = [
  { id: 'performance', label: 'Performance' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'best_practices', label: 'Best Practices' },
  { id: 'seo', label: 'SEO' },
  { id: 'security', label: 'Security' },
  { id: 'email', label: 'Email' },
  { id: 'domain', label: 'Domain' },
  { id: 'google_business', label: 'Google Business' },
  { id: 'apple_business', label: 'Apple Business' },
  { id: 'social', label: 'Social' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'presence', label: 'Listings' },
];

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
    /not (?:found|claimed|listed|set up|configured|verified)|no (?:clear\s+)?(?:listing|profile|page|presence)|(?:no|not)\s+(?:on\s+)?(?:apple|google)|missing|none found|does not (?:appear|exist)|invisible|unlisted|no clear\b/i.test(
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

  return { status: 'ok', summary: 'Mentioned in audit', why };
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

function clientFriendlyBullets(lines: string[], limit = 4): string[] {
  return lines
    .map((line) =>
      line
        .replace(/\bFCP\b/gi, 'first paint speed')
        .replace(/\bLCP\b/gi, 'largest content paint')
        .replace(/\bCLS\b/gi, 'layout shift')
        .replace(/\bCSP\b/g, 'content security policy')
        .replace(/\bHSTS\b/g, 'HTTPS lock-in header')
        .replace(/\bDMARC\b/g, 'DMARC (email spoofing protection)')
        .replace(/\bDKIM\b/g, 'DKIM (email signing)')
        .replace(/\bSPF\b/g, 'SPF (allowed senders)')
        .replace(/\bTLS\b/g, 'encryption'),
    )
    .filter((line) => line.length > 2)
    .slice(0, limit);
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
    categoryLabel: 'Performance',
    maxRank: 3,
    problem: (cat) =>
      cat.score != null
        ? `The site scores ${cat.score}/100 on speed — visitors on phones will feel the lag.`
        : 'The site feels slow, especially on phones.',
    solution: 'Performance pass: trim heavy scripts, optimize images, and tighten hosting so pages open fast.',
  },
  {
    id: 'a11y-access',
    categoryId: 'accessibility',
    categoryLabel: 'Accessibility',
    maxRank: 3,
    problem: (cat) =>
      cat.score != null
        ? `Accessibility scores ${cat.score}/100 — some customers will struggle to use the site.`
        : 'Parts of the site are hard for some visitors to use.',
    solution:
      'Accessibility cleanup: contrast, labels, tap targets, and keyboard-friendly navigation.',
  },
  {
    id: 'bp-hygiene',
    categoryId: 'best_practices',
    categoryLabel: 'Best Practices',
    maxRank: 3,
    problem: (cat) =>
      cat.score != null
        ? `Best Practices scores ${cat.score}/100 — browsers are flagging quality issues.`
        : 'The site is missing modern quality / browser best-practice checks.',
    solution: 'Technical hygiene pass: console errors, deprecated APIs, and secure asset loading.',
  },
  {
    id: 'seo-findable',
    categoryId: 'seo',
    categoryLabel: 'SEO',
    maxRank: 3,
    problem: (cat) =>
      cat.score != null
        ? `SEO scores ${cat.score}/100 — the site is harder to find in Google than it should be.`
        : 'Search visibility is weaker than it should be for a local business.',
    solution:
      'Local SEO package: titles, meta descriptions, schema, and Google Business alignment.',
  },
  {
    id: 'security-harden',
    categoryId: 'security',
    categoryLabel: 'Security',
    maxRank: 3,
    problem: (cat) =>
      cat.grade
        ? `Website security grade is ${cat.grade}.`
        : 'Security protections on the site look incomplete.',
    solution: 'SSL & security hardening: certificate health plus missing protection headers.',
  },
  {
    id: 'email-auth',
    categoryId: 'email',
    categoryLabel: 'Email',
    maxRank: 3,
    problem: () =>
      'Email authentication (SPF / DKIM / DMARC) has gaps — messages can look spoofed or land in spam.',
    solution: 'Email authentication setup so customer and business mail deliver reliably.',
  },
  {
    id: 'domain-dns',
    categoryId: 'domain',
    categoryLabel: 'Domain',
    maxRank: 2,
    problem: () => 'Domain or DNS looks unstable or misconfigured.',
    solution: 'DNS cleanup and monitoring so the site and email keep resolving correctly.',
  },
  {
    id: 'gbp',
    categoryId: 'google_business',
    categoryLabel: 'Google Business',
    maxRank: 3,
    problem: (cat) =>
      cat.grade === 'F'
        ? 'No solid Google Business Profile showed up — many local customers search Maps first.'
        : 'Google Business Profile needs attention (hours, photos, or claim status).',
    solution: 'Google Business Profile claim + optimization so Maps and local search work for you.',
  },
  {
    id: 'apple',
    categoryId: 'apple_business',
    categoryLabel: 'Apple Business',
    maxRank: 3,
    problem: (cat) =>
      cat.grade === 'F'
        ? 'No Apple Business Connect / Apple Maps listing showed up.'
        : 'Apple Maps listing looks incomplete or unclaimed.',
    solution: 'Apple Business Connect setup so iPhone users can find you in Maps.',
  },
  {
    id: 'social',
    categoryId: 'social',
    categoryLabel: 'Social',
    maxRank: 3,
    problem: () => 'Social presence is quiet, missing, or inconsistent with the website.',
    solution: 'Social setup and a simple posting cadence so the brand stays visible.',
  },
  {
    id: 'reviews',
    categoryId: 'reviews',
    categoryLabel: 'Reviews',
    maxRank: 3,
    problem: () => 'Reviews aren’t doing enough work for the business yet.',
    solution: 'Review generation and reputation monitoring across Google / Yelp / key sites.',
  },
  {
    id: 'listings',
    categoryId: 'presence',
    categoryLabel: 'Listings',
    maxRank: 3,
    problem: () => 'Directory listings are thin, inconsistent, or missing.',
    solution: 'Listings / citations cleanup so name, address, and phone match everywhere.',
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
    } else if (/seo|meta|search|schema/.test(lower)) {
      categoryId = 'seo';
      categoryLabel = 'SEO';
    } else if (/google business|gbp|maps/.test(lower)) {
      categoryId = 'google_business';
      categoryLabel = 'Google Business';
    } else if (/apple/.test(lower)) {
      categoryId = 'apple_business';
      categoryLabel = 'Apple Business';
    } else if (/ssl|security|header/.test(lower)) {
      categoryId = 'security';
      categoryLabel = 'Security';
    } else if (/spf|dkim|dmarc|email/.test(lower)) {
      categoryId = 'email';
      categoryLabel = 'Email';
    } else if (/review/.test(lower)) {
      categoryId = 'reviews';
      categoryLabel = 'Reviews';
    } else if (/social|instagram|facebook/.test(lower)) {
      categoryId = 'social';
      categoryLabel = 'Social';
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
  label: string,
  score: number | null,
  section: string,
  fallbackGrade: LetterGrade | null,
  emptySummary: string,
): ReportCardCategory {
  const grade = scoreToGrade(score) ?? fallbackGrade;
  const why = clientFriendlyBullets(bulletsFromSection(section), 5);
  return {
    id,
    label,
    summary:
      grade == null
        ? section.trim()
          ? `${label} notes on file`
          : emptySummary
        : score != null
          ? `${label} score ${score}`
          : `${label} check`,
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
      categories: [],
      ideas: [],
      actionItems: [],
      potential: null,
      overallScore: null,
      potentialScore: null,
    };
  }

  const perfSection = extractSection(body, /Website Performance|Performance/);
  const seoSection = extractSection(body, /SEO|Search(?:\s+Fundamentals)?/);
  const a11ySection = extractSection(body, /Accessibility(?:\s*\(WCAG\))?/);
  const bpSection = extractSection(body, /Best Practices|Best\-Practices/);
  const sslSection = extractSection(body, /SSL\s*&\s*Security|Website Security|Security|SSL/);
  const dnsSection = extractSection(
    body,
    /DNS\s*&\s*Email|Domain\s*&\s*DNS|DNS|Email(?:\s+Auth(?:entication)?)?/,
  );
  const contentSection = extractSection(body, /Content Issues|Content/);
  const presenceSection = extractSection(
    body,
    /Online Presence|Local Presence|Presence|Listings|Reputation/,
  );
  const uxSection = extractSection(body, /UX\s*&\s*UI|Playwright|Mobile Responsiveness/);

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
    extractNamedScore(scorePool, /accessibility/);
  const bpScore =
    lhScores.best_practices ??
    extractNamedScore(bpSection, /best[-\s]?practices?/) ??
    extractNamedScore(scorePool, /best[-\s]?practices?/);
  const seoScore =
    lhScores.seo ??
    extractNamedScore(seoSection, /seo/) ??
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
    if (/fail|contrast|missing (?:alt|label)|tap target|wcag/.test(lower)) {
      return 'D' as LetterGrade;
    }
    if (/pass|good|no major/.test(lower)) return 'B' as LetterGrade;
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
    // Infer a soft grade from SSL/security hygiene when no BP section exists.
    if (/missing .+ header|mixed.content/.test(sslSection.toLowerCase())) {
      return 'D' as LetterGrade;
    }
    if (/ssl|certificate|valid|https/.test(sslSection.toLowerCase())) {
      return 'C' as LetterGrade;
    }
    return null;
  })();

  const sslGrade = findLetterGrade(sslSection) ?? findLetterGrade(body);
  const securityGrade =
    sslGrade ??
    (() => {
      const lower = sslSection.toLowerCase() || body.toLowerCase();
      if (!sslSection.trim() && !/\bssl\b|certificate|https|security header/i.test(body)) {
        return null;
      }
      if (/expired|not trusted|invalid|http,? not https/.test(lower)) return 'F' as LetterGrade;
      if (/missing .+ header|mixed.content|not fully secure/.test(lower)) {
        return 'D' as LetterGrade;
      }
      if (/valid|ok|looks good|certificate is valid/.test(lower)) return 'B' as LetterGrade;
      return sslSection.trim() ? ('C' as LetterGrade) : null;
    })();

  const dnsCorpus =
    dnsSection.trim() ||
    body
      .split('\n')
      .filter((l) => /\b(spf|dkim|dmarc|mx\b|whois|nameserver|a record|dns)\b/i.test(l))
      .join('\n');
  const email = emailGradeFromText(dnsCorpus);
  const domain = domainGradeFromText(dnsCorpus || dnsSection);

  // Presence: prefer the Online Presence section; also scrape related lines from the whole body.
  const presenceExtras = body
    .split('\n')
    .map((l) => stripMd(l))
    .filter((l) =>
      /google|apple\s*maps|apple\s*business|yelp|facebook|instagram|tiktok|linkedin|review|maps|listing|citation|tripadvisor|bing\s*places|social/i.test(
        l,
      ),
    );
  const presenceCorpus = [presenceSection, contentSection, ...presenceExtras]
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
      omittedSummary: 'No Google Business listing called out',
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
      omittedSummary: 'No Apple Maps listing called out',
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
      omittedSummary: 'No active social presence called out',
      omittedWhy:
        'The presence check did not mention social profiles — treat as missing or inactive until confirmed.',
    },
    presenceAudited,
  );
  const reviews = assessChannel(
    presenceCorpus,
    {
      keywords: [/reviews?|ratings?|\d(?:\.\d)?\s*stars?|yelp|reputation/i],
      omittedAsMissing: true,
      omittedSummary: 'No review footprint called out',
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
      omittedSummary: 'Directory listings look thin',
      omittedWhy:
        'Other directories (Yelp, Bing Places, citations) were not clearly documented as healthy listings.',
    },
    presenceAudited,
  );

  const channelCategory = (
    id: ReportCardCategoryId,
    label: string,
    signal: PresenceSignal,
  ): ReportCardCategory => ({
    id,
    label,
    summary: signal.summary,
    grade: signalToGrade(signal),
    why: clientFriendlyBullets(signal.why, 4),
    // Only hide when we truly have nothing — omitted-as-missing becomes a real F/D grade.
    unavailable: signal.status === 'unavailable' || signal.status === 'unknown',
  });

  const rawCategories: ReportCardCategory[] = [
    scoreCategory(
      'performance',
      'Performance',
      perfScore,
      perfSection,
      perfSection.trim() || perfScore != null ? 'C' : null,
      'Not scored in this audit',
    ),
    scoreCategory(
      'accessibility',
      'Accessibility',
      a11yScore,
      a11ySection,
      a11yFallback,
      'Not scored in this audit',
    ),
    scoreCategory(
      'best_practices',
      'Best Practices',
      bpScore,
      bpSection || (bpFallback ? sslSection || uxSection : ''),
      bpFallback,
      'Not scored in this audit',
    ),
    scoreCategory(
      'seo',
      'SEO',
      seoScore,
      seoSection || (seoFallback ? seoCorpus : ''),
      seoFallback,
      'Not scored in this audit',
    ),
    {
      id: 'security',
      label: 'Security',
      summary:
        securityGrade == null
          ? 'Not scored in this audit'
          : sslGrade
            ? `Website security grade ${sslGrade}`
            : 'Certificate & protection checks',
      grade: securityGrade,
      why: clientFriendlyBullets(bulletsFromSection(sslSection || body), 5),
      unavailable: securityGrade == null,
    },
    {
      id: 'email',
      label: 'Email',
      summary: email.summary,
      grade: email.grade,
      why: clientFriendlyBullets(email.why, 5),
      unavailable: email.unavailable || email.grade == null,
    },
    {
      id: 'domain',
      label: 'Domain',
      summary: domain.summary,
      grade: domain.grade,
      why: clientFriendlyBullets(domain.why, 4),
      unavailable: domain.grade == null,
    },
    channelCategory('google_business', 'Google Business', gbp),
    channelCategory('apple_business', 'Apple Business', apple),
    channelCategory('social', 'Social', social),
    channelCategory('reviews', 'Reviews', reviews),
    channelCategory('presence', 'Listings', listings),
  ];

  // Don't show empty "—" rows to clients — only graded / available categories.
  const categories = rawCategories.filter((c) => c.grade && !c.unavailable);

  const overall = averageGrade(categories.map((c) => c.grade));
  const actionItems = extractActionItems(body);
  const ideas = buildIdeas(rawCategories, body, actionItems);
  const potential = improveGrade(overall, ideas.length >= 3 || actionItems.length >= 4 ? 2 : 1);

  return {
    isAudit: true,
    inProgress: false,
    title: input.title || 'Website audit',
    website: extractWebsiteLine(body),
    overall,
    categories,
    ideas,
    actionItems,
    potential,
    overallScore: gradeToScore(overall),
    potentialScore: gradeToScore(potential),
  };
}

export function reportCardCategoryMeta(): typeof CATEGORY_META {
  return CATEGORY_META;
}
