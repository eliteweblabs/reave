/**
 * Fill the audit one-pager templates as a sales leave-behind.
 *
 * Dummy-first: `/admin/sales-sheet` renders a fixture (query-overridable)
 * so we can iterate without running a live audit. `salesSheetInputFromReportCard`
 * is the later hook into `buildAuditReportCard()`.
 */
import type { ContactRecord } from './contactApi';
import type {
  AuditReportCard,
  LetterGrade,
  ReportCardCategoryId,
  ReportCardIdea,
} from './auditReportCard';
import { isPlacesMissFinding, promotePlacesNotListedFinding } from './salesSheetPlacesView';

export type SalesSheetOrientation = 'portrait' | 'landscape';

export const AUDIT_ONEPAGER_SLUGS = {
  landscape: 'audit-onepager-landscape',
  portrait: 'audit-onepager-portrait',
} as const;

export const SALES_SHEET_FINDING_COUNT = 3;

export type SalesSheetFinding = {
  id: string;
  categoryLabel: string;
  problem: string;
  solution: string;
};

export type AuditSalesSheetInput = {
  contact: ContactRecord;
  website: string;
  headline: string;
  overall: LetterGrade | null;
  overallScore: number | null;
  performance: LetterGrade | null;
  security: LetterGrade | null;
  visibility: LetterGrade | null;
  findings: SalesSheetFinding[];
};

const GRADES = new Set<LetterGrade>(['A', 'B', 'C', 'D', 'F']);

const DUMMY_CONTACT: ContactRecord = {
  uid: 'preview',
  name: 'Jordan Hale',
  firstName: 'Jordan',
  lastName: 'Hale',
  email: 'jordan@haleco.example',
  phone: '(555) 010-0148',
  company: 'Hale & Co.',
};

export const DUMMY_SALES_SHEET: AuditSalesSheetInput = {
  contact: DUMMY_CONTACT,
  website: 'haleco.example',
  headline: 'Speed and local listings are the two leaks costing Hale & Co. inbound calls.',
  overall: 'C',
  overallScore: 64,
  performance: 'F',
  security: 'B',
  visibility: 'D',
  findings: [
    {
      id: 'dummy-speed',
      categoryLabel: 'Site Speed',
      problem: 'The homepage takes more than five seconds to become useful on a phone.',
      solution: 'Compress images and defer scripts so the phone load lands under three seconds.',
    },
    {
      id: 'dummy-listings',
      categoryLabel: 'Maps & Directories',
      problem: 'The business is missing from Google Business Profile and Apple Maps.',
      solution: 'Claim both listings, match NAP, and turn on booking or call tracking.',
    },
    {
      id: 'dummy-seo',
      categoryLabel: 'SEO Fundamentals',
      problem: 'Title tags and Open Graph are incomplete, so shares look unfinished.',
      solution: 'Finish titles, meta, and share cards so every link looks like the brand.',
    },
  ],
};

export function auditOnePagerSlug(orientation: SalesSheetOrientation): string {
  return orientation === 'portrait' ? AUDIT_ONEPAGER_SLUGS.portrait : AUDIT_ONEPAGER_SLUGS.landscape;
}

export function parseSalesSheetOrientation(raw: string | null | undefined): SalesSheetOrientation {
  return raw?.trim().toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
}

/** Full-audit URL encoded in the sales-sheet QR. Query overrides: audit, run, uid, project. */
export function salesSheetAuditUrl(params: URLSearchParams, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  const explicit = params.get('audit')?.trim();
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return explicit;
    return `${base}${explicit.startsWith('/') ? '' : '/'}${explicit}`;
  }
  const run = params.get('run')?.trim();
  if (run) return `${base}/digital-audit?run=${encodeURIComponent(run)}`;
  const uid = params.get('uid')?.trim();
  if (uid) {
    const qs = new URLSearchParams({ tab: 'audit' });
    const project = params.get('project')?.trim();
    if (project) qs.set('project', project);
    return `${base}/c/${encodeURIComponent(uid)}?${qs}`;
  }
  return `${base}/digital-audit`;
}

function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const at = sliced.lastIndexOf(' ');
  return `${(at > 80 ? sliced.slice(0, at) : sliced).trim()}…`;
}

function escMarkdown(s: string): string {
  return s.replace(/([\\`*_[\]#])/g, '\\$1');
}

function parseGrade(raw: string | null | undefined): LetterGrade | null | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  return GRADES.has(trimmed as LetterGrade) ? (trimmed as LetterGrade) : undefined;
}

function parseScore(raw: string | null | undefined): number | null | undefined {
  if (raw == null || !raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function formatSalesSheetGrade(
  grade: LetterGrade | null | undefined,
  score?: number | null,
): string {
  if (!grade) return '—';
  if (score != null && Number.isFinite(score)) return `${grade} (${score})`;
  return grade;
}

export function selectTopFindings(
  ideas: Array<Pick<ReportCardIdea, 'id' | 'categoryLabel' | 'problem' | 'solution' | 'priority'>>,
  count = SALES_SHEET_FINDING_COUNT,
): SalesSheetFinding[] {
  return ideas
    .slice()
    .sort((a, b) => {
      const aBoost = isPlacesMissFinding(a) ? -100 : 0;
      const bBoost = isPlacesMissFinding(b) ? -100 : 0;
      return a.priority + aBoost - (b.priority + bBoost);
    })
    .slice(0, count)
    .map((idea) => ({
      id: idea.id,
      categoryLabel: idea.categoryLabel.trim() || 'Opportunity',
      problem: clip(idea.problem),
      solution: clip(idea.solution),
    }));
}

function categoryGrade(card: AuditReportCard, id: ReportCardCategoryId): LetterGrade | null {
  if (card.featured?.id === id && card.featured.grade) return card.featured.grade;
  return card.categories.find((c) => c.id === id)?.grade ?? null;
}

export function salesSheetInputFromReportCard(
  card: AuditReportCard,
  contact: ContactRecord,
  opts?: { googlePlacesListed?: boolean | null },
): AuditSalesSheetInput {
  const businessName = (contact.company || contact.name || '').trim();
  let findings = selectTopFindings(card.ideas);
  let visibility = categoryGrade(card, 'local_listings') || categoryGrade(card, 'seo');
  let headline = (card.headline || '').trim();

  if (opts?.googlePlacesListed === false) {
    findings = promotePlacesNotListedFinding(findings, businessName);
    visibility = 'F';
    if (!/google|maps|listed/i.test(headline)) {
      headline = `${businessName || 'This business'} is not listed on Google — nearby searches show competitors.`;
    }
  }

  return {
    contact,
    website: (card.website || contact.company || '').trim(),
    headline,
    overall: card.overall,
    overallScore: card.overallScore,
    performance: categoryGrade(card, 'performance'),
    security: categoryGrade(card, 'security'),
    visibility,
    findings,
  };
}

/** Apply a live Places miss to dummy/query input (finding #1 + visibility F). */
export function applyPlacesMissToSalesSheet(
  input: AuditSalesSheetInput,
  notListed: boolean,
): AuditSalesSheetInput {
  if (!notListed) return input;
  const businessName = (input.contact.company || input.contact.name || '').trim();
  return {
    ...input,
    visibility: 'F',
    headline: /google|maps|listed/i.test(input.headline)
      ? input.headline
      : `${businessName || 'This business'} is not listed on Google — nearby searches show competitors.`,
    findings: promotePlacesNotListedFinding(input.findings, businessName),
  };
}

function overrideFinding(
  base: SalesSheetFinding,
  index: number,
  params: URLSearchParams,
): SalesSheetFinding {
  const n = index + 1;
  const label = params.get(`label${n}`)?.trim();
  const problem = params.get(`finding${n}`)?.trim();
  const solution = params.get(`solution${n}`)?.trim();
  return {
    id: base.id,
    categoryLabel: label || base.categoryLabel,
    problem: problem ? clip(problem) : base.problem,
    solution: solution ? clip(solution) : base.solution,
  };
}

/** Query-overridable dummy input. Missing params keep the fixture. */
export function salesSheetInputFromSearchParams(params: URLSearchParams): AuditSalesSheetInput {
  const contact: ContactRecord = { ...DUMMY_SALES_SHEET.contact };
  const company = params.get('company')?.trim();
  const name = params.get('name')?.trim();
  const email = params.get('email')?.trim();
  if (company) contact.company = company;
  if (email) contact.email = email;
  if (name) {
    contact.name = name;
    const parts = name.split(/\s+/).filter(Boolean);
    contact.firstName = parts[0] || contact.firstName;
    contact.lastName = parts.slice(1).join(' ') || contact.lastName;
  }

  const overall = parseGrade(params.get('overall'));
  const performance = parseGrade(params.get('performance'));
  const security = parseGrade(params.get('security'));
  const visibility = parseGrade(params.get('visibility'));
  const overallScore = parseScore(params.get('score'));
  const website = params.get('site')?.trim();
  const headline = params.get('headline')?.trim();

  return {
    contact,
    website: website || DUMMY_SALES_SHEET.website,
    headline: headline || DUMMY_SALES_SHEET.headline,
    overall: overall === undefined ? DUMMY_SALES_SHEET.overall : overall,
    overallScore: overallScore === undefined ? DUMMY_SALES_SHEET.overallScore : overallScore,
    performance: performance === undefined ? DUMMY_SALES_SHEET.performance : performance,
    security: security === undefined ? DUMMY_SALES_SHEET.security : security,
    visibility: visibility === undefined ? DUMMY_SALES_SHEET.visibility : visibility,
    findings: DUMMY_SALES_SHEET.findings.map((finding, i) => overrideFinding(finding, i, params)),
  };
}

function snapshotColumn(input: AuditSalesSheetInput): string {
  const site = input.website.trim() || '{client.company}';
  const lines = [
    '### Snapshot',
    '',
    `**Site** — ${escMarkdown(site)}`,
    '**Prepared for** — {client.name}',
    '**Scanned** — {date}',
    '',
    `- Overall — ${formatSalesSheetGrade(input.overall, input.overallScore)}`,
    `- Performance — ${formatSalesSheetGrade(input.performance)}`,
    `- Security — ${formatSalesSheetGrade(input.security)}`,
    `- Visibility — ${formatSalesSheetGrade(input.visibility)}`,
  ];
  if (input.headline.trim()) {
    lines.push('', escMarkdown(input.headline.trim()));
  }
  return lines.join('\n');
}

function findingsColumn(findings: SalesSheetFinding[]): string {
  const items = findings.length ? findings : DUMMY_SALES_SHEET.findings;
  const rows = items.map((finding, i) => {
    const label = escMarkdown(finding.categoryLabel);
    const problem = escMarkdown(finding.problem);
    return `${i + 1}. **${label}** — ${problem}`;
  });
  return ['### Findings', '', ...rows].join('\n');
}

function nextStepsColumn(findings: SalesSheetFinding[]): string {
  const items = findings.length ? findings : DUMMY_SALES_SHEET.findings;
  const rows = items.map((finding, i) => {
    const label = escMarkdown(finding.categoryLabel);
    const solution = escMarkdown(finding.solution);
    return `${i + 1}. **${label}** — ${solution}`;
  });
  return ['### Next steps', '', ...rows].join('\n');
}

export function replaceOnePagerColumns(markdown: string, columns: string[]): string {
  const fmMatch = markdown.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const frontmatter = fmMatch?.[0] ?? '---\n---';
  const body = columns
    .slice(0, 3)
    .map((col) => `:::column\n${col.trim()}\n`)
    .join('');
  return `${frontmatter}\n\n${body}`;
}

export function setFrontmatterTitle(markdown: string, title: string): string {
  if (/^title:\s*.+$/m.test(markdown)) {
    return markdown.replace(/^title:\s*.+$/m, `title: ${title}`);
  }
  return markdown.replace(/^---\r?\n/, `---\ntitle: ${title}\n`);
}

/** Rewrite Snapshot / Findings / Next steps; leave footer shortcodes for fillTemplate. */
export function fillAuditOnePager(markdown: string, input: AuditSalesSheetInput): string {
  const filled = replaceOnePagerColumns(markdown, [
    snapshotColumn(input),
    findingsColumn(input.findings),
    nextStepsColumn(input.findings),
  ]);
  return setFrontmatterTitle(filled, 'Website Audit');
}

const COLUMN_MARK = /^:::column\s*$/m;

export function parseFilledOnePagerColumns(markdown: string): string[] {
  const withoutFm = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
  if (!COLUMN_MARK.test(withoutFm)) return [withoutFm];
  const parts = withoutFm
    .split(COLUMN_MARK)
    .map((part) => part.trim())
    .filter(Boolean);
  while (parts.length < 3) parts.push('');
  return parts.slice(0, 3);
}
