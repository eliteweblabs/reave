/**
 * Fill the audit one-pager templates as a sales leave-behind.
 *
 * Dummy-first: `/admin/sales-sheet` renders a fixture (query-overridable)
 * so we can iterate without running a live audit. `salesSheetInputFromReportCard`
 * is the later hook into `buildAuditReportCard()`.
 */
import { extractPortal, type ContactRecord } from './contactApi';
import {
  AUDIT_GRADE_LEGEND,
  AUDIT_REPORT_DISCLAIMER,
  AUDIT_SCAN_STACK,
  extractAuditWebsite,
  type AuditReportCard,
  type LetterGrade,
  type ReportCardCategoryId,
  type ReportCardIdea,
} from './auditReportCard';
import {
  cascadeRankForFinding,
  mergePlacesIntoCascadeFindings,
  selectCascadeFindings,
  type CascadeFinding,
} from './salesSheetCascade';
import {
  GOOGLE_MOBILE_ABANDON_3S,
  resolveSalesSheetCitations,
  sheetSpeedResearchProblem,
  siteSpeedResearchProblem,
} from './salesSheetResearch';

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
  rank?: number;
  sheet?: string;
  citations?: string[];
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
      problem: siteSpeedResearchProblem({
        style: 'footnote',
        suffix: 'This homepage takes more than five seconds on a phone.',
      }),
      solution: 'Compress images and defer scripts so the phone load lands under three seconds.',
      citations: [GOOGLE_MOBILE_ABANDON_3S.id],
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

/** Live google.com Places/Maps shot unless `?google=0`. */
export function salesSheetWantsGoogleShot(googleParam: string | null | undefined): boolean {
  return (googleParam || '').trim() !== '0';
}

export type AuditCompanyOption = {
  slug: string;
  company: string;
  contactName: string;
  contactUid: string;
};

const AUDIT_TAG_RE = /^(siri-audit|quick-audit|full-audit)$/i;

function isAuditProject(job: {
  status?: string | null;
  tags?: string[] | null;
  source?: string | null;
}): boolean {
  if ((job.status || '').toLowerCase() === 'audit') return true;
  if ((job.source || '').toLowerCase() === 'siri_audit') return true;
  return (job.tags ?? []).some((t) => AUDIT_TAG_RE.test(String(t || '')));
}

function isArchivedProject(status?: string | null): boolean {
  const s = (status || '').toLowerCase();
  return s === 'archived' || s === 'done';
}

/** One row per company, latest audit project wins. */
export function listAuditCompanies(
  jobs: Array<{
    slug: string;
    title?: string;
    client?: string;
    contact_name?: string;
    contact_uid?: string;
    status?: string | null;
    tags?: string[] | null;
    source?: string | null;
    updated?: string;
  }>,
): AuditCompanyOption[] {
  const byCompany = new Map<string, AuditCompanyOption & { updated: string }>();
  for (const job of jobs) {
    if (!isAuditProject(job) || isArchivedProject(job.status)) continue;
    const company = (job.client || job.contact_name || job.title || job.slug).trim();
    if (!company) continue;
    const key = company.toLowerCase();
    const updated = job.updated || '';
    const existing = byCompany.get(key);
    if (existing && existing.updated >= updated) continue;
    byCompany.set(key, {
      slug: job.slug,
      company,
      contactName: (job.contact_name || '').trim(),
      contactUid: (job.contact_uid || '').trim(),
      updated,
    });
  }
  return [...byCompany.values()]
    .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }))
    .map(({ updated: _updated, ...row }) => row);
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
      const rankDiff = cascadeRankForFinding(a) - cascadeRankForFinding(b);
      if (rankDiff !== 0) return rankDiff;
      return a.priority - b.priority;
    })
    .slice(0, count)
    .map((idea) => {
      const marked = sheetSpeedResearchProblem(idea.problem);
      return {
        id: idea.id,
        categoryLabel: idea.categoryLabel.trim() || 'Opportunity',
        problem: clip(marked.problem),
        solution: clip(idea.solution),
        rank: cascadeRankForFinding(idea),
        citations: marked.citations.length ? marked.citations : undefined,
      };
    });
}

function categoryGrade(card: AuditReportCard, id: ReportCardCategoryId): LetterGrade | null {
  if (card.featured?.id === id && card.featured.grade) return card.featured.grade;
  return card.categories.find((c) => c.id === id)?.grade ?? null;
}

function contactPortalWebsite(contact: ContactRecord): string {
  const portal = extractPortal(contact);
  if (!portal) return '';
  if (portal.website?.trim()) return portal.website.trim();
  for (const field of portal.fields ?? []) {
    if (/^(website|site) url$/i.test(field.label || '') && field.value?.trim()) {
      return field.value.trim();
    }
  }
  return '';
}

function resolveSalesSheetWebsite(
  cardWebsite: string | undefined,
  contact: ContactRecord,
): string {
  const fromCard = extractAuditWebsite(cardWebsite);
  if (fromCard) return fromCard;
  return extractAuditWebsite(contactPortalWebsite(contact)) || '';
}

function toSheetFinding(hit: CascadeFinding): SalesSheetFinding {
  const marked = sheetSpeedResearchProblem(hit.problem);
  return {
    id: hit.id,
    categoryLabel: hit.categoryLabel,
    problem: clip(marked.problem),
    solution: clip(hit.solution),
    rank: hit.rank,
    sheet: hit.sheet,
    citations: marked.citations.length ? marked.citations : undefined,
  };
}

function fillFindingsFromIdeas(
  hits: SalesSheetFinding[],
  ideas: ReportCardIdea[],
): SalesSheetFinding[] {
  if (hits.length >= SALES_SHEET_FINDING_COUNT) return hits.slice(0, SALES_SHEET_FINDING_COUNT);
  const used = new Set(hits.map((h) => h.id));
  const usedLabels = new Set(hits.map((h) => h.categoryLabel.toLowerCase()));
  const extra = selectTopFindings(
    ideas.filter((idea) => !used.has(idea.id) && !usedLabels.has(idea.categoryLabel.toLowerCase())),
    SALES_SHEET_FINDING_COUNT - hits.length,
  );
  return [...hits, ...extra].slice(0, SALES_SHEET_FINDING_COUNT);
}

export function salesSheetInputFromReportCard(
  card: AuditReportCard,
  contact: ContactRecord,
  opts?: { googlePlacesListed?: boolean | null; body?: string },
): AuditSalesSheetInput {
  const businessName = (contact.company || contact.name || '').trim();
  const cascadeHits = selectCascadeFindings({
    body: opts?.body || '',
    businessName,
    card,
    googlePlacesListed: opts?.googlePlacesListed,
    securityGrade: categoryGrade(card, 'security'),
  });
  let findings = fillFindingsFromIdeas(cascadeHits.map(toSheetFinding), card.ideas);
  let visibility = categoryGrade(card, 'local_listings') || categoryGrade(card, 'seo');
  if (opts?.googlePlacesListed === false) visibility = 'F';
  const lead = findings[0];
  const headline = lead?.problem || (card.headline || '').trim();

  return {
    contact,
    website: resolveSalesSheetWebsite(card.website, contact),
    headline,
    overall: card.overall,
    overallScore: card.overallScore,
    performance: categoryGrade(card, 'performance'),
    security: categoryGrade(card, 'security'),
    visibility,
    findings,
  };
}

/** Apply a live Places miss without jumping SSL / down / domain / malware. */
export function applyPlacesMissToSalesSheet(
  input: AuditSalesSheetInput,
  notListed: boolean,
): AuditSalesSheetInput {
  const businessName = (input.contact.company || input.contact.name || '').trim();
  const findings = mergePlacesIntoCascadeFindings(
    input.findings.map((f) => ({
      id: f.id,
      rank: cascadeRankForFinding(f),
      categoryLabel: f.categoryLabel,
      sheet: f.sheet || '',
      problem: f.problem,
      solution: f.solution,
    })),
    notListed,
    businessName,
  ).map(toSheetFinding);
  const lead = findings[0];
  return {
    ...input,
    visibility: notListed ? 'F' : input.visibility,
    headline: lead?.problem || input.headline,
    findings,
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
    citations: problem
      ? sheetSpeedResearchProblem(problem).citations
      : base.citations,
    categoryLabel: label || base.categoryLabel,
    problem: problem ? clip(problem) : base.problem,
    solution: solution ? clip(solution) : base.solution,
  };
}

/** Overlay query fields onto dummy or a live audit sheet. Missing params keep the base. */
export function applySalesSheetParamOverrides(
  base: AuditSalesSheetInput,
  params: URLSearchParams,
): AuditSalesSheetInput {
  const contact: ContactRecord = { ...base.contact };
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
    website: website || base.website,
    headline: headline || base.headline,
    overall: overall === undefined ? base.overall : overall,
    overallScore: overallScore === undefined ? base.overallScore : overallScore,
    performance: performance === undefined ? base.performance : performance,
    security: security === undefined ? base.security : security,
    visibility: visibility === undefined ? base.visibility : visibility,
    findings: base.findings.map((finding, i) => overrideFinding(finding, i, params)),
  };
}

/** Query-overridable dummy input. Missing params keep the fixture. */
export function salesSheetInputFromSearchParams(params: URLSearchParams): AuditSalesSheetInput {
  return applySalesSheetParamOverrides(DUMMY_SALES_SHEET, params);
}

function snapshotColumn(input: AuditSalesSheetInput): string {
  const lines = [
    '### Snapshot',
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
  return setFrontmatterTitle(filled, 'Website Audit').replace(/Page 1 of 1/g, 'Page 1 of 2');
}

const COLUMN_MARK = /^:::column\s*$/m;

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Compact portal-matching disclaimer for the sales one-pager footer. */
export function renderAuditDisclaimerHtml(
  findings: Array<{ citations?: string[]; problem?: string }> = [],
): string {
  const citations = resolveSalesSheetCitations(findings);
  const legend = AUDIT_GRADE_LEGEND.map((row) => `${row.grade} ${row.range}`).join(' · ');
  const stack = AUDIT_SCAN_STACK.map((tool) => escHtml(tool.name)).join(' · ');
  const sources = citations
    .map(
      (cite) =>
        `<p class="ss-disclaimer-row ss-disclaimer-source"><span class="ss-disclaimer-mark">${escHtml(cite.mark)}</span>${escHtml(cite.source)}</p>`,
    )
    .join('');
  return `
<style>
.ss-disclaimer {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  margin-top: 0.55em;
}
.ss-disclaimer-row {
  margin: 0;
  line-height: 1.35;
}
.ss-disclaimer-kicker {
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-right: 0.45em;
}
.ss-disclaimer-mark {
  font-weight: 700;
  margin-right: 0.3em;
}
.ss-disclaimer-source {
  font-size: 0.92em;
}
.ss-disclaimer-copy {
  margin: 0;
  font-style: italic;
  line-height: 1.4;
}
</style>
<div class="ss-disclaimer">
  <p class="ss-disclaimer-row"><span class="ss-disclaimer-kicker">Grading scale</span>${escHtml(legend)}</p>
  <p class="ss-disclaimer-row"><span class="ss-disclaimer-kicker">Measurement stack</span>${stack}</p>
  ${sources ? `<div class="ss-disclaimer-sources"><p class="ss-disclaimer-row"><span class="ss-disclaimer-kicker">Sources</span></p>${sources}</div>` : ''}
  <p class="ss-disclaimer-copy">${escHtml(AUDIT_REPORT_DISCLAIMER)}</p>
</div>`.trim();
}

export function injectAuditDisclaimerIntoFooter(sheetHtml: string, disclaimerHtml = renderAuditDisclaimerHtml()): string {
  if (!disclaimerHtml.trim()) return sheetHtml;
  const close = '</footer>';
  const footerAt = sheetHtml.lastIndexOf('<footer class="doc-onepager-footer">');
  if (footerAt < 0) return sheetHtml;
  const closeAt = sheetHtml.indexOf(close, footerAt);
  if (closeAt < 0) return sheetHtml;
  return `${sheetHtml.slice(0, closeAt)}${disclaimerHtml}${sheetHtml.slice(closeAt)}`;
}

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
