/**
 * Classifiers + evidence-markdown helpers for Playwright issue screenshots.
 * Run: npm run check:playwright-shots
 */
import assert from 'node:assert/strict';
import {
  classifyBrokenImages,
  classifyClippedText,
  classifyFormNoSubmit,
  classifyHamburgerIssue,
  classifyLowContrast,
  classifyOverflow,
  classifyOverscroll,
  classifySmallTapTargets,
  classifyUnclickableCtas,
  contrastRatio,
  formatUxEvidenceMarkdown,
  issueShotFilename,
  mergeUxEvidenceSection,
  UX_EVIDENCE_HEADING,
  VISUAL_CONTRAST_MIN,
} from '../src/lib/playwrightIssueDetect.ts';

assert.equal(classifyHamburgerIssue({ found: false, panelVisible: false, visibleLinkCount: 0 }), null);
assert.equal(
  classifyHamburgerIssue({ found: true, panelVisible: true, visibleLinkCount: 4 }),
  null,
);

const empty = classifyHamburgerIssue({
  found: true,
  panelVisible: true,
  visibleLinkCount: 0,
});
assert.equal(empty?.kind, 'hamburger-empty');
assert.match(empty?.title ?? '', /empty/i);

const closed = classifyHamburgerIssue({
  found: true,
  panelVisible: false,
  visibleLinkCount: 0,
});
assert.equal(closed?.kind, 'hamburger-closed');

assert.equal(classifyOverflow(0), null);
assert.equal(classifyOverflow(3)?.kind, 'overflow');
assert.equal(classifyOverscroll(0), null);
assert.equal(classifyOverscroll(8), null);
assert.equal(classifyOverscroll(48)?.kind, 'overscroll');
assert.match(classifyOverscroll(48)?.title ?? '', /sideways/i);

assert.equal(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }), 1);
assert.ok(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) > 20);
assert.ok(contrastRatio({ r: 170, g: 170, b: 170 }, { r: 255, g: 255, b: 255 }) < VISUAL_CONTRAST_MIN);
assert.equal(classifyLowContrast(0), null);
assert.equal(classifyLowContrast(2, 1.1)?.kind, 'low-contrast');
assert.match(classifyLowContrast(2, 1.1)?.detail ?? '', /1\.1/);
assert.equal(classifyBrokenImages(0), null);
assert.equal(classifyBrokenImages(1)?.kind, 'broken-image');
assert.equal(classifyClippedText(0), null);
assert.equal(classifyClippedText(3)?.kind, 'clipped-text');

assert.equal(classifySmallTapTargets(0), null);
assert.equal(classifySmallTapTargets(2)?.kind, 'small-tap-targets');
assert.equal(classifyUnclickableCtas([]), null);
assert.equal(classifyUnclickableCtas(['Book now'])?.kind, 'unclickable-cta');
assert.equal(classifyFormNoSubmit(0), null);
assert.equal(classifyFormNoSubmit(1)?.kind, 'form-no-submit');

assert.equal(issueShotFilename('mobile', 'hamburger-empty'), 'ux-mobile-hamburger-empty.png');

const evidence = formatUxEvidenceMarkdown([
  {
    url: '/api/work/demo/files/abc',
    filename: 'ux-mobile-hamburger-empty.png',
    title: 'Mobile nav is empty after hamburger tap',
    detail: 'Hamburger was tapped and a menu panel appeared, but it had no visible links.',
  },
]);
assert.match(evidence, /visually broken/);
assert.match(evidence, /!\[Mobile nav is empty after hamburger tap\]\(\/api\/work\/demo\/files\/abc\)/);

const body = `## Website Audit

### UX & UI (Playwright)
- Hamburger opens but the menu is empty

### Action Items
- [ ] Fix the mobile nav
`;
const merged = mergeUxEvidenceSection(body, evidence);
assert.match(merged, new RegExp(UX_EVIDENCE_HEADING.replace(/[()]/g, '\\$&')));
assert.match(merged, /### Action Items/);
assert.ok(merged.indexOf(UX_EVIDENCE_HEADING) < merged.indexOf('### Action Items'));

const again = mergeUxEvidenceSection(merged, evidence);
assert.equal(again.split(UX_EVIDENCE_HEADING).length, 2);

console.log('verify-playwright-issue-shots: ok');
