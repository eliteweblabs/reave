/**
 * Pure classifiers for Playwright UX issue screenshots.
 * Kept separate from the browser client so we can unit-test
 * "when do we snap" without launching Chromium.
 */

export type PlaywrightIssueKind =
  | 'hamburger-empty'
  | 'hamburger-closed'
  | 'overflow'
  | 'small-tap-targets'
  | 'unclickable-cta'
  | 'form-no-submit';

export type PlaywrightIssueMeta = {
  kind: PlaywrightIssueKind;
  title: string;
  detail: string;
};

/** After tapping the hamburger: did a useful nav actually appear? */
export function classifyHamburgerIssue(state: {
  found: boolean;
  panelVisible: boolean;
  visibleLinkCount: number;
}): PlaywrightIssueMeta | null {
  if (!state.found) return null;
  if (state.visibleLinkCount > 0) return null;
  if (state.panelVisible) {
    return {
      kind: 'hamburger-empty',
      title: 'Mobile nav is empty after hamburger tap',
      detail:
        'Hamburger was tapped and a menu panel appeared, but it had no visible links.',
    };
  }
  return {
    kind: 'hamburger-closed',
    title: 'Hamburger tap did not open navigation',
    detail:
      'Hamburger was tapped; no nav panel or links became visible.',
  };
}

export function classifyOverflow(count: number): PlaywrightIssueMeta | null {
  if (count <= 0) return null;
  return {
    kind: 'overflow',
    title: 'Content overflows the viewport',
    detail: `${count} element${count === 1 ? '' : 's'} extend past the right edge of the viewport.`,
  };
}

export function classifySmallTapTargets(count: number): PlaywrightIssueMeta | null {
  if (count <= 0) return null;
  return {
    kind: 'small-tap-targets',
    title: 'Tap targets smaller than 44px',
    detail: `${count} tappable control${count === 1 ? '' : 's'} measure under the 44×44px mobile minimum.`,
  };
}

export function classifyUnclickableCtas(
  labels: string[],
): PlaywrightIssueMeta | null {
  if (!labels.length) return null;
  const shown = labels.slice(0, 3).map((t) => `"${t}"`).join(', ');
  return {
    kind: 'unclickable-cta',
    title: 'Unclickable call-to-action',
    detail: `${labels.length} CTA${labels.length === 1 ? '' : 's'} not clickable: ${shown}.`,
  };
}

export function issueShotFilename(
  viewport: 'desktop' | 'mobile',
  kind: PlaywrightIssueKind,
): string {
  return `ux-${viewport}-${kind}.png`;
}

export function classifyFormNoSubmit(formsWithoutSubmit: number): PlaywrightIssueMeta | null {
  if (formsWithoutSubmit <= 0) return null;
  return {
    kind: 'form-no-submit',
    title: 'Form is missing a submit button',
    detail: `${formsWithoutSubmit} form${formsWithoutSubmit === 1 ? '' : 's'} have fields but no submit control.`,
  };
}

export const UX_EVIDENCE_HEADING = '### UX Evidence (Playwright)';

export function formatUxEvidenceMarkdown(
  files: Array<{ url: string; filename: string; title?: string; detail?: string }>,
): string {
  const lines = [
    'Issue screenshots from Playwright (headless Chromium) — captured when a check **failed**, not a generic homepage gallery.',
    '',
  ];
  for (const file of files) {
    const title = file.title || file.filename;
    lines.push(`![${title}](${file.url})`);
    if (file.detail) lines.push(file.detail);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function mergeUxEvidenceSection(body: string, evidenceMarkdown: string): string {
  const block = `${UX_EVIDENCE_HEADING}\n${evidenceMarkdown.trim()}\n`;
  const existingRe = /### UX Evidence \(Playwright\)\n[\s\S]*?(?=\n### |\n## |$)/;
  if (existingRe.test(body)) {
    return body.replace(existingRe, `${block.trimEnd()}\n`);
  }
  const uxRe = /(### UX\s*&\s*UI[^\n]*\n[\s\S]*?)(?=\n### |\n## |$)/;
  if (uxRe.test(body)) {
    return body.replace(uxRe, `$1\n\n${block.trimEnd()}\n`);
  }
  return `${body.trimEnd()}\n\n${block}`;
}
