/**
 * Parse website-audit markdown (playbook body) into a client-facing report card.
 * Does not re-run audits — filters existing Work job body for the portal UI.
 */

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type ReportCardCategoryId =
  | 'website'
  | 'search'
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

export interface AuditReportCard {
  isAudit: boolean;
  /** Stub “in progress” Siri project — show waiting state, not grades. */
  inProgress: boolean;
  title: string;
  website?: string;
  overall: LetterGrade | null;
  categories: ReportCardCategory[];
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
  { id: 'website', label: 'Website' },
  { id: 'search', label: 'Search' },
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
  const re = new RegExp(
    `(?:^|\\n)#{2,3}\\s+(?:${heading.source})\\s*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s+|$)`,
    'i',
  );
  const m = body.match(re);
  return m?.[1]?.trim() ?? '';
}

/** Prefer explicit mobile/desktop performance scores; average when both exist. */
function extractPerformanceScore(text: string): number | null {
  const mobile = findNumber(text, [
    /mobile(?:\s+performance|\s+perf(?:ormance)?\s*score)?\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?mobile[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  const desktop = findNumber(text, [
    /desktop(?:\s+performance|\s+perf(?:ormance)?\s*score)?\s*[:\-–]?\s*(\d{1,3})/i,
    /performance[^.\n]{0,40}?desktop[^.\n]{0,20}?(\d{1,3})/i,
  ]);
  if (mobile != null && desktop != null) return Math.round((mobile + desktop) / 2);
  if (mobile != null) return mobile;
  if (desktop != null) return desktop;
  return (
    findNumber(text, [
      /(?:performance|perf(?:ormance)?\s*score)\s*[:\-–]?\s*(\d{1,3})/i,
      /performance[^.\n]{0,40}?(\d{1,3})\s*\/\s*100/i,
    ]) ?? null
  );
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

type PresenceSignal = {
  status: 'strong' | 'ok' | 'weak' | 'missing' | 'unknown' | 'unavailable';
  summary: string;
  why: string[];
};

function presenceSignal(lines: string[], keywords: RegExp[]): PresenceSignal {
  const hits = lines.filter((line) => keywords.some((re) => re.test(line)));
  if (!hits.length) {
    return {
      status: 'unknown',
      summary: 'Not covered in this audit',
      why: ['This category was not called out in the written audit notes.'],
    };
  }

  const joined = hits.join(' ').toLowerCase();
  const why = hits.slice(0, 4);

  if (
    /unavailable|quota exceeded|data unavailable|could not (?:check|verify)|n\/?a\b/.test(
      joined,
    )
  ) {
    return { status: 'unavailable', summary: 'Could not verify right now', why };
  }
  if (
    /not (?:found|claimed|listed|set up|configured)|no (?:listing|profile|page|presence)|missing|none found|does not (?:appear|exist)/.test(
      joined,
    )
  ) {
    return { status: 'missing', summary: 'No listing found', why };
  }
  if (
    /conflict|outdated|incomplete|inconsistent|wrong hours|not claimed|unclaimed|inactive|stale|placeholder|needs update|hours (?:don.?t|do not) match/.test(
      joined,
    )
  ) {
    return { status: 'weak', summary: 'Needs attention', why };
  }
  if (
    /found|claimed|active|verified|complete|optimized|looking good|strong|present/.test(joined)
  ) {
    const hasPraise = /strong|optimized|complete|verified|looking good|excellent|great/.test(
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
  if (/###\s+Website Performance/i.test(body) && /###\s+SSL/i.test(body)) return true;
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
      actionItems: [],
      potential: null,
      overallScore: null,
      potentialScore: null,
    };
  }

  const perfSection = extractSection(body, /Website Performance|Performance/);
  const seoSection = extractSection(body, /SEO/);
  const a11ySection = extractSection(body, /Accessibility/);
  const sslSection = extractSection(body, /SSL\s*&\s*Security|Security|SSL/);
  const dnsSection = extractSection(body, /DNS\s*&\s*Email|DNS|Email/);
  const contentSection = extractSection(body, /Content Issues|Content/);
  const presenceSection = extractSection(body, /Online Presence|Presence|Listings/);
  const uxSection = extractSection(body, /UX\s*&\s*UI|Playwright/);

  const presenceLines = bulletsFromSection(presenceSection);
  const allPresenceish = [
    ...presenceLines,
    ...bulletsFromSection(contentSection).filter((l) =>
      /google|apple|yelp|facebook|instagram|review|listing/i.test(l),
    ),
  ];

  const perfScore = extractPerformanceScore(perfSection);

  const seoScore =
    findNumber(seoSection, [
      /(?:seo(?:\s*score)?)\s*[:\-–]?\s*(\d{1,3})/i,
      /(\d{1,3})\s*\/\s*100/,
    ]) ?? null;

  const a11yScore = findNumber(a11ySection, [
    /(?:accessibility(?:\s*score)?)\s*[:\-–]?\s*(\d{1,3})/i,
    /(\d{1,3})\s*\/\s*100/,
  ]);

  const websiteScores = [perfScore, a11yScore].filter((n): n is number => n != null);
  const websiteScore = websiteScores.length
    ? Math.round(websiteScores.reduce((a, b) => a + b, 0) / websiteScores.length)
    : null;
  const websiteGrade = scoreToGrade(websiteScore);
  const websiteWhy = clientFriendlyBullets([
    ...bulletsFromSection(perfSection),
    ...bulletsFromSection(a11ySection),
    ...bulletsFromSection(uxSection),
  ]);

  const searchGrade =
    scoreToGrade(seoScore) ??
    (() => {
      const lower = seoSection.toLowerCase();
      if (!seoSection.trim()) return null;
      if (/missing|empty|no meta|not index/.test(lower)) return 'D' as LetterGrade;
      if (/present|good|optimized/.test(lower)) return 'B' as LetterGrade;
      return 'C' as LetterGrade;
    })();

  const sslGrade = findLetterGrade(sslSection);
  const securityGrade =
    sslGrade ??
    (() => {
      const lower = sslSection.toLowerCase();
      if (!sslSection.trim()) return null;
      if (/expired|not trusted|invalid|http,? not https/.test(lower)) return 'F' as LetterGrade;
      if (/missing .+ header|mixed.content/.test(lower)) return 'D' as LetterGrade;
      if (/valid|ok|looks good/.test(lower)) return 'B' as LetterGrade;
      return 'C' as LetterGrade;
    })();

  const email = emailGradeFromText(dnsSection);
  const domain = domainGradeFromText(dnsSection);

  const gbp = presenceSignal(allPresenceish, [
    /google\s*business/i,
    /\bgbp\b/i,
    /maps\.google/i,
  ]);
  const apple = presenceSignal(allPresenceish, [
    /apple\s*business/i,
    /apple\s*maps/i,
    /business\s*connect/i,
  ]);
  const social = presenceSignal(allPresenceish, [
    /instagram|facebook|tiktok|linkedin|social/i,
  ]);
  const reviews = presenceSignal(allPresenceish, [
    /review|rating|stars?|yelp/i,
  ]);
  const listings = presenceSignal(allPresenceish, [
    /yelp|bing\s*places|tripadvisor|directories|listings?/i,
  ]);

  const categories: ReportCardCategory[] = [
    {
      id: 'website',
      label: 'Website',
      summary:
        websiteGrade == null
          ? perfSection
            ? 'Performance notes on file'
            : 'Not scored in this audit'
          : websiteScore != null
            ? `Speed & experience score ${websiteScore}`
            : 'Based on site checks',
      grade: websiteGrade,
      score: websiteScore,
      why:
        websiteWhy.length > 0
          ? websiteWhy
          : ['Website performance details were limited in this audit.'],
      unavailable: websiteGrade == null && !perfSection,
    },
    {
      id: 'search',
      label: 'Search',
      summary:
        searchGrade == null
          ? 'Not scored in this audit'
          : seoScore != null
            ? `SEO score ${seoScore}`
            : 'How findable the site looks',
      grade: searchGrade,
      score: seoScore,
      why: clientFriendlyBullets(bulletsFromSection(seoSection), 4),
      unavailable: searchGrade == null && !seoSection,
    },
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
      why: clientFriendlyBullets(bulletsFromSection(sslSection), 5),
      unavailable: securityGrade == null && !sslSection,
    },
    {
      id: 'email',
      label: 'Email',
      summary: email.summary,
      grade: email.grade,
      why: clientFriendlyBullets(email.why, 5),
      unavailable: email.unavailable,
    },
    {
      id: 'domain',
      label: 'Domain',
      summary: domain.summary,
      grade: domain.grade,
      why: clientFriendlyBullets(domain.why, 4),
      unavailable: domain.grade == null && !dnsSection,
    },
    {
      id: 'google_business',
      label: 'Google Business',
      summary: gbp.summary,
      grade: signalToGrade(gbp),
      why: clientFriendlyBullets(gbp.why, 4),
      unavailable: gbp.status === 'unavailable' || gbp.status === 'unknown',
    },
    {
      id: 'apple_business',
      label: 'Apple Business',
      summary: apple.summary,
      grade: signalToGrade(apple),
      why: clientFriendlyBullets(apple.why, 4),
      unavailable: apple.status === 'unavailable' || apple.status === 'unknown',
    },
    {
      id: 'social',
      label: 'Social',
      summary: social.summary,
      grade: signalToGrade(social),
      why: clientFriendlyBullets(social.why, 4),
      unavailable: social.status === 'unavailable' || social.status === 'unknown',
    },
    {
      id: 'reviews',
      label: 'Reviews',
      summary: reviews.summary,
      grade: signalToGrade(reviews),
      why: clientFriendlyBullets(reviews.why, 4),
      unavailable: reviews.status === 'unavailable' || reviews.status === 'unknown',
    },
    {
      id: 'presence',
      label: 'Listings',
      summary: listings.summary,
      grade: signalToGrade(listings),
      why: clientFriendlyBullets(listings.why, 4),
      unavailable: listings.status === 'unavailable' || listings.status === 'unknown',
    },
  ];

  // Prefer categories that actually have a grade for the overall average.
  const overall = averageGrade(categories.map((c) => c.grade));
  const actionItems = extractActionItems(body);
  const potential = improveGrade(overall, actionItems.length >= 4 ? 2 : 1);

  return {
    isAudit: true,
    inProgress: false,
    title: input.title || 'Website audit',
    website: extractWebsiteLine(body),
    overall,
    categories,
    actionItems,
    potential,
    overallScore: gradeToScore(overall),
    potentialScore: gradeToScore(potential),
  };
}

export function reportCardCategoryMeta(): typeof CATEGORY_META {
  return CATEGORY_META;
}
