/**
 * Footnotable research lines for the audit sales sheet.
 * Only stats with a named, dated source belong here.
 */

export type SalesSheetCitation = {
  id: string;
  mark: string;
  source: string;
};

/** 53% abandon after 3s — Google Analytics sample, Think with Google (March 2016). */
export const GOOGLE_MOBILE_ABANDON_3S: SalesSheetCitation = {
  id: 'google-mobile-abandon-3s',
  mark: '¹',
  source:
    'Google, aggregated anonymized Google Analytics data from a sample of mobile websites (n=3,700), March 2016; Think with Google, “The Need for Mobile Speed.”',
};

const CITATIONS: Record<string, SalesSheetCitation> = {
  [GOOGLE_MOBILE_ABANDON_3S.id]: GOOGLE_MOBILE_ABANDON_3S,
};

const SPEED_STAT = '53% of mobile visitors leave if a page takes longer than 3 seconds to load';

export function siteSpeedResearchProblem(opts?: {
  style?: 'inline' | 'footnote';
  suffix?: string;
}): string {
  const lead =
    opts?.style === 'footnote'
      ? `${SPEED_STAT}.${GOOGLE_MOBILE_ABANDON_3S.mark}`
      : `${SPEED_STAT} (Google, 2016).`;
  return opts?.suffix ? `${lead} ${opts.suffix}` : lead;
}

export function sheetSpeedResearchProblem(problem: string): {
  problem: string;
  citations: string[];
} {
  if (!/53% of mobile visitors leave/.test(problem)) {
    return { problem, citations: [] };
  }
  const next = problem.includes(GOOGLE_MOBILE_ABANDON_3S.mark)
    ? problem
    : problem.replace(/\s*\(Google, 2016\)\.?/, `.${GOOGLE_MOBILE_ABANDON_3S.mark}`);
  return { problem: next, citations: [GOOGLE_MOBILE_ABANDON_3S.id] };
}

export function resolveSalesSheetCitations(findings: Array<{ citations?: string[]; problem?: string }>): SalesSheetCitation[] {
  const seen = new Set<string>();
  const out: SalesSheetCitation[] = [];
  for (const finding of findings) {
    const ids = finding.citations?.length
      ? finding.citations
      : sheetSpeedResearchProblem(finding.problem || '').citations;
    for (const id of ids) {
      if (seen.has(id)) continue;
      const cite = CITATIONS[id];
      if (!cite) continue;
      seen.add(id);
      out.push(cite);
    }
  }
  return out;
}
