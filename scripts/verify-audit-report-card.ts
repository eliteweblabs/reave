/**
 * Synthetic checks for website-audit report-card scoring.
 * Run: npm run check:audit-report
 *
 * Guards the bug where playbook `Performance score: {mobile} / {desktop}`
 * was graded on the mobile lab number alone (F for almost every site,
 * including nytimes.com / reddit.com).
 */
import assert from 'node:assert/strict';
import {
  AUDIT_SCAN_STACK,
  buildAuditReportCard,
  extractAuditWebsite,
  labPerformanceToGrade,
  reportCardCategoryMeta,
} from '../src/lib/auditReportCard.ts';
import { rewriteGooglePlacesNotListedCopy } from '../src/lib/auditPlacesListing.ts';
import { isBusinessNameMatch } from '../src/lib/googlePlacesAutocomplete.ts';
import { formatLighthouseResults } from '../src/lib/lighthouseClient.ts';

function playbook(opts: {
  name: string;
  mobile: number;
  desktop: number;
  crux?: string;
  ux?: string;
}) {
  const crux = opts.crux
    ? `- Real-user experience (Chrome UX Report): ${opts.crux}`
    : '';
  const ux =
    opts.ux ??
    `### UX & UI (Playwright)
- Source: Playwright (headless Chromium) — desktop 1440×900 + mobile 375×812
- Layout adapts; a few overflow elements and small tap targets on mobile

### Mobile Responsiveness
- Source: Playwright (headless Chromium) real-browser checks
- Responsive layout; tap targets below 44px on the header nav`;
  return `## Website Audit

**Current Website:** example.com

### Performance
- Performance score: ${opts.mobile} / ${opts.desktop} (Lighthouse)
${crux}
- FCP 2.4 s · LCP 5.1 s
- Render-blocking scripts and large images

### Accessibility
- Accessibility score: 88 / 100

### Best Practices
- Best Practices score: 79 / 100

### SEO
- SEO score: 92 / 100
- SEO inventory grade: B (82/100)

### SSL & Website Security
- SSL: valid, Grade B

${ux}

### DNS & Email
- SPF: pass
- DKIM: pass
- DMARC: pass
`;
}

function card(name: string, body: string) {
  const r = buildAuditReportCard({
    title: `${name} audit`,
    tags: ['siri-audit', 'quick-audit'],
    source: 'siri_audit',
    body,
    clientName: name,
  });
  assert.ok(r, `${name}: expected a report card`);
  return r;
}

{
  assert.equal(labPerformanceToGrade(90), 'A');
  assert.equal(labPerformanceToGrade(70), 'B');
  assert.equal(labPerformanceToGrade(59), 'C');
  assert.equal(labPerformanceToGrade(35), 'D');
  assert.equal(labPerformanceToGrade(20), 'F');
  console.log('ok — lab performance grade curve');
}

{
  const r = card(
    'Typical local 35/82',
    playbook({ name: 'Typical', mobile: 35, desktop: 82 }),
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  const mobile = r.categories.find((c) => c.id === 'mobile');
  assert.equal(perf?.score, 59, 'average 35/82');
  assert.equal(perf?.grade, 'C', 'typical lab average is C, not F');
  assert.match(perf?.finding || '', /Mobile lab 35\/100/);
  assert.match(perf?.finding || '', /Desktop 82\/100/);
  assert.equal(mobile?.grade, 'B', 'tap targets must not auto-D a responsive layout');
  assert.match(mobile?.source || '', /Playwright/, 'mobile tile cites Playwright');
  const speedIdea = r.ideas.find((i) => i.categoryId === 'performance');
  assert.ok(speedIdea, 'C speed still offers a speed idea');
  assert.equal(
    /people on phones will leave/i.test(speedIdea!.problem),
    false,
    'do not claim phones bounce on a C average',
  );
  const mobileIdea = r.ideas.find((i) => i.categoryId === 'mobile');
  assert.equal(mobileIdea, undefined, 'B mobile layout should not pitch awkward-on-phones');
  console.log('ok — playbook 35/82 averages to C; layout stays B');
}

{
  const r = card(
    'NYT-like 20/76',
    playbook({ name: 'NYT', mobile: 20, desktop: 76 }),
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  assert.equal(perf?.score, 48);
  assert.equal(perf?.grade, 'C', 'nytimes-like lab average must not be F');
  console.log('ok — nytimes-like 20/76 is C, not F');
}

{
  const r = card(
    'Reddit-like 22/71',
    playbook({ name: 'Reddit', mobile: 22, desktop: 71 }),
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  assert.equal(perf?.score, 47);
  assert.equal(perf?.grade, 'C');
  console.log('ok — reddit-like 22/71 is C, not F');
}

{
  const r = card(
    'CrUX Good upgrades lab Poor',
    playbook({ name: 'NYT field', mobile: 20, desktop: 76, crux: 'Good' }),
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  assert.equal(perf?.score, 90);
  assert.equal(perf?.grade, 'A');
  assert.match(perf?.finding || '', /Real visitors/i);
  assert.match(perf?.finding || '', /20\/100/);
  console.log('ok — Chrome UX Report Good beats lab-mobile Poor');
}

{
  const r = card(
    'Tool dump MOBILE then DESKTOP',
    `## Website Audit
### Performance
Lighthouse audit: https://example.com

MOBILE (lab)
Scores — performance: 31, accessibility: 88, best-practices: 79, seo: 92

DESKTOP (lab)
Scores — performance: 84, accessibility: 88, best-practices: 79, seo: 92

### SSL & Website Security
- SSL: valid, Grade B
`,
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  assert.equal(perf?.score, 58);
  assert.equal(perf?.grade, 'C');
  assert.match(perf?.finding || '', /Mobile lab 31\/100/);
  assert.match(perf?.finding || '', /Desktop 84\/100/);
  const mobile = r.categories.find((c) => c.id === 'mobile');
  assert.equal(mobile, undefined, 'do not invent a Mobile tile from Lighthouse MOBILE scores');
  console.log('ok — tool dump averages MOBILE/DESKTOP lab blocks');
}

{
  const r = card(
    'Labeled near-perfect viewports',
    `## Website Audit
### Performance
- Mobile: 96 / 100 · Desktop: 96 / 100 — Outstanding
### SSL & Website Security
- SSL: valid, Grade B
`,
  );
  const perf = r.categories.find((c) => c.id === 'performance');
  assert.equal(perf?.grade, 'A');
  assert.equal(perf?.score, 96);
  const mobile = r.categories.find((c) => c.id === 'mobile');
  assert.equal(mobile, undefined, 'performance Mobile: 96 is not a layout audit');
  const mobileIdea = r.ideas.find((i) => i.categoryId === 'mobile');
  assert.equal(mobileIdea, undefined, 'must not pitch awkward-on-phones for 96/96 speed');
  console.log('ok — labeled 96/96 stays A and does not invent a mobile layout F');
}

{
  const r = card(
    'Broken on phones',
    playbook({
      name: 'Broken',
      mobile: 80,
      desktop: 90,
      ux: `### Mobile Responsiveness
- Broken on mobile — horizontal scroll, unusable on phone`,
    }),
  );
  const mobile = r.categories.find((c) => c.id === 'mobile');
  assert.equal(mobile?.grade, 'D');
  console.log('ok — actual mobile layout breakage still grades D');
}

{
  const text = formatLighthouseResults({
    ok: true,
    url: 'https://www.nytimes.com/',
    results: [
      {
        strategy: 'mobile',
        scores: { performance: 20 },
        metrics: { lcp: '10.1 s' },
        opportunities: [],
        diagnostics: [],
        pageExperience: { overall: 'AVERAGE' },
        originExperience: { overall: 'FAST' },
      },
      {
        strategy: 'desktop',
        scores: { performance: 76 },
        metrics: { lcp: '1.9 s' },
        opportunities: [],
        diagnostics: [],
      },
    ],
  });
  assert.match(text, /Field data \(this URL\) — Needs Improvement/);
  assert.match(text, /Field data \(origin\) — Good/);
  assert.match(text, /MOBILE \(lab\)/);
  assert.match(text, /performance: 20/);
  assert.match(text, /throttled stress test/);
  console.log('ok — lighthouse formatter surfaces CrUX and labels lab scores');
}

{
  assert.ok(
    AUDIT_SCAN_STACK.some((t) => t.name === 'Playwright'),
    'audit frontend stack lists Playwright',
  );
  const meta = reportCardCategoryMeta();
  const mobile = meta.find((c) => c.id === 'mobile');
  const lead = meta.find((c) => c.id === 'lead_capture');
  assert.match(mobile?.source || '', /Playwright/);
  assert.match(lead?.source || '', /Playwright/);
  console.log('ok — Playwright is listed on the audit frontend stack');
}

{
  assert.equal(extractAuditWebsite('CALA RENEE Salon'), undefined);
  assert.equal(extractAuditWebsite('[CALA RENEE Salon](https://calareneesalon.com)'), 'calareneesalon.com');
  assert.equal(extractAuditWebsite('https://www.calareneesalon.com/'), 'calareneesalon.com');
  assert.equal(extractAuditWebsite('haleco.example (Wix)'), 'haleco.example');
  console.log('ok — website extractor prefers URL/domain over page title');
}

{
  const r = card(
    'Agency GSC note must not reach the client',
    `${playbook({ name: 'Safelite', mobile: 80, desktop: 90 })}

### Analytics & Conversion Tracking
- Not run — no owned property, no verified Search Console/Google Analytics/Plausible access, and the audited domain is a third-party national brand we don't control.

### Search / Analytics
- Status: **Failed** — no owned property on the agency Google account
`,
  );
  const analytics = r.categories.find((c) => c.id === 'analytics');
  assert.ok(analytics, 'analytics tile should still render');
  assert.equal(analytics?.grade, 'D');
  assert.match(analytics?.finding || '', /No analytics or conversion tracking was found/i);
  assert.equal(
    /owned property|we don'?t control|Search Console|third-party/i.test(analytics?.finding || ''),
    false,
    'agency access copy must not appear on the client card',
  );
  for (const line of analytics?.why || []) {
    assert.equal(
      /owned property|we don'?t control|third-party national/i.test(line),
      false,
      `agency why leaked: ${line}`,
    );
  }
  console.log('ok — agency Search Console notes are rewritten to a site-install finding');
}

{
  const r = card(
    'Not Secure letter',
    `## Website Audit

**Your website is showing a "Not Secure" warning to customers.**
We need to update your website's security certificate.
`,
  );
  const security = r.categories.find((c) => c.id === 'security');
  assert.equal(security?.grade, 'F', 'browser Not Secure warning is an F');
  console.log('ok — Not Secure write-up grades security F');
}

{
  assert.equal(
    rewriteGooglePlacesNotListedCopy(
      'Google Business Profile: Missing — not listed in the Google Places API (no exact address match).',
    ),
    'Google Business Profile: Missing — not listed in the Google Places API (no business match found).',
  );
  assert.equal(
    isBusinessNameMatch("Joe's Pizza", "Joe's Pizza, Springfield, IL"),
    true,
    'city-only Places hit still counts as a business match',
  );
  assert.equal(
    isBusinessNameMatch("Joe's Pizza", '123 Main St, Springfield, IL'),
    false,
    'street-only prediction is not a business match',
  );
  console.log('ok — Places listing is a business-name match, not an address match');
}

{
  const r = buildAuditReportCard({
    title: 'Maps miss audit',
    tags: ['siri-audit', 'quick-audit'],
    source: 'siri_audit',
    clientName: 'Joe\'s Pizza',
    googlePlacesListed: false,
    body: `${playbook({ name: "Joe's Pizza", mobile: 80, desktop: 90 })}

### Online Presence
- Google Business Profile: Missing — not listed in the Google Places API (no exact address match).
`,
  });
  assert.ok(r);
  const maps = r!.categories.find((c) => c.id === 'local_listings');
  const blob = `${maps?.finding || ''}\n${(maps?.why || []).join('\n')}`;
  assert.match(blob, /no business match found|not listed in the Google Places API/i);
  assert.equal(/exact address match/i.test(blob), false, 'old address-match copy must not reach the client');
  console.log('ok — Maps & Directories says no business match found');
}

{
  const r = card(
    'Tech stack install beats agency not-run',
    `${playbook({ name: 'Installed', mobile: 80, desktop: 90 })}

### Technology Stack
- CMS: WordPress
- Analytics: Google Analytics, Google Tag Manager

### Analytics & Conversion Tracking
- Not run — no owned property, no verified Search Console access

### Search / Analytics
- Status: **Failed** — ANALYTICS_FAILED
`,
  );
  const analytics = r.categories.find((c) => c.id === 'analytics');
  assert.equal(analytics?.grade, 'B');
  assert.match(analytics?.finding || '', /Google Analytics/);
  assert.match(analytics?.finding || '', /Google Tag Manager/);
  assert.equal(/owned property|Failed/i.test(analytics?.finding || ''), false);
  console.log('ok — installed GA/GTM from tech stack grades B');
}

{
  const r = card(
    'Explicit missing tracking',
    `${playbook({ name: 'Untracked', mobile: 80, desktop: 90 })}

### Analytics & Conversion Tracking
- No Google Analytics, tag manager, or conversion pixels found on the homepage
`,
  );
  const analytics = r.categories.find((c) => c.id === 'analytics');
  assert.equal(analytics?.grade, 'D');
  assert.match(analytics?.finding || '', /No analytics or conversion tracking was found/i);
  console.log('ok — missing site tracking is noted, not an access story');
}

{
  const r = card(
    'Installed without conversion goals',
    `${playbook({ name: 'Goals', mobile: 80, desktop: 90 })}

### Analytics & Conversion Tracking
- Google Analytics is installed
- Conversion goals are not configured — leads go untracked
`,
  );
  const analytics = r.categories.find((c) => c.id === 'analytics');
  assert.equal(analytics?.grade, 'C');
  assert.match(analytics?.finding || '', /conversion goals are not configured/i);
  console.log('ok — installed analytics without goals is a C');
}

{
  const r = card(
    'Lighthouse BP is not domain reputation',
    `## Website Audit

### Domain & IP Reputation
- Lighthouse best-practices 100 on both viewports. Modern build, HTTPS throughout, no console errors flagged.

### Best Practices
- Lighthouse best-practices 100 on both viewports. Modern build, HTTPS throughout, no console errors flagged.

### SSL & Website Security
- SSL: valid, Grade B
`,
  );
  const featuredFinding = r.featured?.finding || '';
  const rep = r.categories.find((c) => c.id === 'domain_reputation');
  const repFinding = rep?.finding || '';
  assert.equal(
    r.featured,
    null,
    'do not feature a Domain & IP Reputation card from Lighthouse copy',
  );
  assert.equal(rep, undefined, 'off-topic best-practices notes must not grade reputation');
  assert.equal(
    /speed & quality|best-practices|both viewports|console errors/i.test(
      `${featuredFinding}\n${repFinding}`,
    ),
    false,
    'reputation finding must not describe a speed/quality scan',
  );
  console.log('ok — Lighthouse best-practices copy does not become a reputation D');
}

{
  const r = card(
    'Clean reputation flags',
    `## Website Audit

### Domain & IP Reputation
- No reputation flags found

### SSL & Website Security
- SSL: valid, Grade B
`,
  );
  assert.equal(r.featured?.id, 'domain_reputation');
  assert.equal(r.featured?.grade, 'B');
  assert.match(r.featured?.finding || '', /Safe Browsing|blocklist|network-reputation/i);
  assert.equal(/speed & quality|best-practices|console errors/i.test(r.featured?.finding || ''), false);
  console.log('ok — no reputation flags found is a B with reputation copy');
}

{
  const r = card(
    'Spamhaus hit',
    `## Website Audit

### Domain & IP Reputation
- Listed on Spamhaus
- Lighthouse best-practices 100 on both viewports. Modern build, HTTPS throughout, no console errors flagged.

### SSL & Website Security
- SSL: valid, Grade B
`,
  );
  assert.equal(r.featured?.id, 'domain_reputation');
  assert.equal(r.featured?.grade, 'D');
  assert.match(r.featured?.finding || '', /Spamhaus/i);
  assert.equal(/speed & quality|best-practices|console errors/i.test(r.featured?.finding || ''), false);
  console.log('ok — real blocklist hits stay a D and keep reputation copy');
}

console.log('all audit report-card checks passed');
