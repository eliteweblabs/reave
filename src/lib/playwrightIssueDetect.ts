/**
 * Pure classifiers for Playwright UX issue screenshots.
 * Kept separate from the browser client so we can unit-test
 * "when do we snap" without launching Chromium.
 */

export type PlaywrightIssueKind =
  | 'hamburger-empty'
  | 'hamburger-closed'
  | 'overflow'
  | 'overscroll'
  | 'low-contrast'
  | 'broken-image'
  | 'clipped-text'
  | 'small-tap-targets'
  | 'unclickable-cta'
  | 'form-no-submit';

/** Below this contrast ratio, text is visually broken (white-on-white / unreadable) — not a WCAG lecture. */
export const VISUAL_CONTRAST_MIN = 2.5;

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

/** Page is wider than the screen — the “it slides sideways” client demo. */
export function classifyOverscroll(extraPx: number): PlaywrightIssueMeta | null {
  if (extraPx <= 8) return null;
  return {
    kind: 'overscroll',
    title: 'Page scrolls sideways',
    detail: `The layout is ${extraPx}px wider than the viewport — the page can be dragged left and right.`,
  };
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
): number {
  const L1 = relativeLuminance(fg.r, fg.g, fg.b);
  const L2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function classifyLowContrast(
  count: number,
  worstRatio?: number,
): PlaywrightIssueMeta | null {
  if (count <= 0) return null;
  const ratio =
    worstRatio != null && Number.isFinite(worstRatio) ? worstRatio.toFixed(1) : null;
  return {
    kind: 'low-contrast',
    title: 'Text is unreadable (low contrast)',
    detail: ratio
      ? `${count} text block${count === 1 ? '' : 's'} sit below ${VISUAL_CONTRAST_MIN}:1 contrast (worst ${ratio}:1) — white-on-white or near-invisible.`
      : `${count} text block${count === 1 ? '' : 's'} sit below ${VISUAL_CONTRAST_MIN}:1 contrast — white-on-white or near-invisible.`,
  };
}

export function classifyBrokenImages(count: number): PlaywrightIssueMeta | null {
  if (count <= 0) return null;
  return {
    kind: 'broken-image',
    title: 'Broken image on the page',
    detail: `${count} image${count === 1 ? '' : 's'} failed to load.`,
  };
}

export function classifyClippedText(count: number): PlaywrightIssueMeta | null {
  if (count <= 0) return null;
  return {
    kind: 'clipped-text',
    title: 'Text is cut off',
    detail: `${count} block${count === 1 ? '' : 's'} of text are clipped by overflow:hidden.`,
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
    'Issue screenshots from Playwright (headless Chromium) — captured when something was **visually broken** (unreadable contrast, sideways scroll, empty nav, clipped text, broken images), not a generic homepage gallery.',
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
