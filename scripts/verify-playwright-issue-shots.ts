/**
 * Classifiers + evidence-markdown helpers for Playwright issue screenshots.
 * Run: npm run check:playwright-shots
 */
import assert from 'node:assert/strict';
import {
  classifyFormNoSubmit,
  classifyHamburgerIssue,
  classifyOverflow,
  classifySmallTapTargets,
  classifyUnclickableCtas,
  formatUxEvidenceMarkdown,
  issueShotFilename,
  mergeUxEvidenceSection,
  UX_EVIDENCE_HEADING,
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
assert.match(evidence, /failed/);
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
