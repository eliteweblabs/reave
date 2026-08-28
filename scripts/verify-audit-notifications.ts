/**
 * Guard: failed Siri/Digital audits must not ship as "Audit Ready"
 * with a deploy banner or raw Anthropic button JSON in the body.
 * Run: npm run check:audit-notifications
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderButton } from '../src/lib/chatResponseRenderer.ts';
import {
  auditLabelFromTitle,
  auditResearchFailureReason,
  extractAuditProposalSummary,
  formatAuditFailedNotification,
  formatAuditReadyNotification,
  formatNotificationPayload,
  formatPwaPushTitle,
  isSiriAuditPushAlert,
  normalizePushAlertCopy,
  stripNotificationDecorations,
} from '../src/lib/notificationFormat.ts';
import { formatHtmlPageTitle, formatPwaAppTitle } from '../src/lib/pageTitle.ts';
import { formatOtpPushNotification } from '../src/lib/emailOtpParser.ts';
import { isAuditWorkInProgress } from '../src/lib/auditReportCard.ts';
import {
  adjustCachedAnthropicBalance,
  auditCreditContinueFloorUsd,
  auditCreditReserveUsd,
  evaluateAuditCreditReserve,
  getAnthropicBalance,
} from '../src/lib/anthropicBalance.ts';

const wayneReply = [
  '🚀 Deploying: f8bc775 "Merge remote-tracking branch \'origin/main\'" — not yet live',
  '',
  "Your Anthropic API credit balance is too low, so the agent can't respond right now.",
  '',
  renderButton('Add Anthropic credits', 'https://console.anthropic.com/settings/billing'),
].join('\n\n');

{
  const stripped = stripNotificationDecorations(wayneReply);
  assert.equal(stripped.includes('🚀 Deploying:'), false);
  assert.equal(stripped.includes('```json'), false);
  assert.equal(stripped.includes('"type":"button"'), false);
  assert.match(stripped, /credit balance is too low/);
  console.log('ok — strip deploy banner and button JSON from audit excerpts');
}

{
  const reason = auditResearchFailureReason(wayneReply);
  assert.equal(reason, "Anthropic is out of credits, so the audit couldn't finish.");
  console.log('ok — credit-error + deploy banner is a failed audit, not deploy news');
}

{
  const copy = formatAuditFailedNotification({
    tier: 'full',
    displayName: "Wayne's drains in Beverly Massachusetts",
    reason: auditResearchFailureReason(wayneReply) || '',
  });
  assert.equal(copy.title, "Full Audit Failed > Wayne's drains in Beverly Massachusetts");
  assert.equal(copy.detail.includes('🚀'), false);
  assert.equal(copy.detail.includes('```'), false);
  assert.match(copy.detail, /out of credits/);
  console.log('ok — failed full audit uses Failed title and a clean reason');
}

{
  const stored = normalizePushAlertCopy({
    tag: 'siri-proposal-waynes-drains',
    title: "Full Audit Ready > Wayne's drains in Beverly Massachusetts",
    detail: wayneReply,
    url: '/admin?tab=work&slug=waynes-drains',
  });
  assert.equal(stored.title, "Full Audit Failed > Wayne's drains in Beverly Massachusetts");
  assert.equal(stored.detail.includes('Deploying'), false);
  assert.equal(stored.detail.includes('```json'), false);
  assert.match(stored.detail, /out of credits/);
  console.log('ok — stored "Audit Ready" cards with credit junk are rewritten on read');
}

{
  assert.equal(
    auditLabelFromTitle("Full Audit Failed > Wayne's drains in Beverly Massachusetts"),
    "Wayne's drains in Beverly Massachusetts",
  );
  assert.equal(isSiriAuditPushAlert('siri-proposal-waynes-drains'), true);
  assert.equal(isSiriAuditPushAlert('other', 'Full Audit Failed > Wayne'), true);
  console.log('ok — failed audit titles still count as audit alerts');
}

{
  const success = [
    '🚀 Deploying: abc1234 "tweaks" — not yet live',
    '',
    'Project: waynes-drains',
    'GBP photos are thin and the mobile Lighthouse score is 41. Book a walkthrough this week.',
  ].join('\n');
  assert.equal(auditResearchFailureReason(success), null);
  assert.equal(
    extractAuditProposalSummary(success, 'waynes-drains'),
    'GBP photos are thin and the mobile Lighthouse score is 41. Book a walkthrough this week.',
  );
  const ready = formatAuditReadyNotification({
    tier: 'full',
    displayName: "Wayne's drains",
    excerpt: extractAuditProposalSummary(success, 'waynes-drains'),
  });
  assert.equal(ready.title, "Full Audit Ready > Wayne's drains");
  assert.equal(ready.detail.includes('🚀'), false);
  console.log('ok — finished audits keep Ready copy and drop a leftover deploy banner');
}

{
  assert.equal(
    isAuditWorkInProgress({
      title: 'Auditing Wayne’s drains…',
      body: '## Siri audit in progress\n\nThe research agent is locating the business.',
    }),
    true,
  );
  assert.equal(
    isAuditWorkInProgress({
      title: 'Great reviews, terrible mobile score',
      body: '## Website Audit\n\n### Performance\n- Performance score: 41 / 72\n'.repeat(8),
    }),
    false,
  );
  console.log('ok — stub vs finished audit detection');
}

{
  assert.equal(auditCreditReserveUsd('quick'), 1.5);
  assert.equal(auditCreditReserveUsd('full'), 4);
  assert.equal(auditCreditContinueFloorUsd('full'), 1);
  assert.equal(auditCreditContinueFloorUsd('quick'), 0.38);

  const blocked = evaluateAuditCreditReserve(
    { balanceUsd: 0.12, source: 'live' },
    4,
    { phase: 'start', tier: 'full' },
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.match(blocked.reason, /too low to start a full audit/);
    assert.match(blocked.reason, /\$0\.12/);
    assert.match(blocked.reason, /\$4\.00/);
  }

  const mid = evaluateAuditCreditReserve(
    { balanceUsd: 0.18, source: 'live' },
    1,
    { phase: 'continue', tier: 'full' },
  );
  assert.equal(mid.ok, false);
  if (!mid.ok) {
    assert.match(mid.reason, /ran too low to finish/);
    assert.equal(auditResearchFailureReason(mid.reason) != null, true);
  }

  const unknown = evaluateAuditCreditReserve(
    { balanceUsd: null, source: 'unconfigured' },
    4,
    { phase: 'start', tier: 'full' },
  );
  assert.equal(unknown.ok, true);

  const enough = evaluateAuditCreditReserve(
    { balanceUsd: 6.5, source: 'live' },
    4,
    { phase: 'start', tier: 'full' },
  );
  assert.equal(enough.ok, true);
  console.log('ok — prepaid credit reserve blocks a full audit at $0.12 and fails open when unknown');
}

{
  process.env.ANTHROPIC_CREDIT_BALANCE_USD = '2.40';
  delete process.env.ANTHROPIC_ORG_ID;
  delete process.env.ANTHROPIC_SESSION_KEY;
  const before = await getAnthropicBalance({ refresh: true });
  assert.equal(before.balanceUsd, 2.4);
  adjustCachedAnthropicBalance(-1.1);
  const after = await getAnthropicBalance();
  assert.equal(after.balanceUsd, 1.3);
  delete process.env.ANTHROPIC_CREDIT_BALANCE_USD;
  console.log('ok — cached prepaid balance is debited as the audit spends');
}

{
  assert.equal(
    formatPwaPushTitle('reΛVe.app', 'Verification code'),
    'reΛVe.app - Verification code',
  );
  assert.equal(
    formatPwaPushTitle('reΛVe.app', 'reΛVe.app - Verification code'),
    'reΛVe.app - Verification code',
  );
  assert.equal(formatPwaPushTitle('', 'Verification code'), 'Verification code');
  const phone = formatNotificationPayload('Verification code', 'Code 95014 — tap to copy', {
    pwaTitle: 'reΛVe.app',
  });
  assert.equal(phone.title, 'reΛVe.app - Verification code');
  assert.equal(phone.detail, 'Code 95014 — tap to copy');
  const otp = formatOtpPushNotification({ purpose: 'Verification code', code: '95014' });
  assert.equal(otp.title, 'Verification code');
  assert.equal(otp.body, 'Code 95014 — tap to copy');
  console.log('ok — phone push is "{PWA title} - {notification title}" plus the description only');
}

{
  assert.equal(
    formatHtmlPageTitle({
      siteName: 'reΛVe.app',
      tagline: 'Small Business, Smaller Workday',
    }),
    'reΛVe.app | Small Business, Smaller Workday',
  );
  assert.equal(
    formatHtmlPageTitle({ page: 'Features', siteName: 'reΛVe.app' }),
    'Features | reΛVe.app',
  );
  assert.equal(
    formatHtmlPageTitle({ page: 'Sign in — reΛVe.app', siteName: 'reΛVe.app' }),
    'Sign in — reΛVe.app',
  );
  assert.equal(formatPwaAppTitle('reΛVe.app'), 'reΛVe.app');
  assert.notEqual(
    formatHtmlPageTitle({
      siteName: 'reΛVe.app',
      tagline: 'Small Business, Smaller Workday',
    }),
    formatPwaAppTitle('reΛVe.app'),
  );
  const phone = formatNotificationPayload('Verification code', 'Code 95014 — tap to copy', {
    pwaTitle: formatPwaAppTitle('reΛVe.app'),
  });
  assert.equal(phone.title.includes('Smaller Workday'), false);
  console.log('ok — HTML page titles keep the tagline; push uses the PWA name only');
}

{
  const hero = readFileSync('src/components/home/HomeHeroSection.astro', 'utf8');
  const card = readFileSync('src/pages/card.astro', 'utf8');
  const header = readFileSync('src/components/Header.astro', 'utf8');
  assert.match(hero, /BrandIconLockup/);
  assert.match(card, /BrandIconLockup/);
  assert.match(card, /variant="hero"/);
  assert.match(card, /nfc-title/);
  assert.doesNotMatch(card, /BrandLogoInline/);
  assert.match(header, /BrandLogoInline/);
  console.log('ok — homepage and /card share BrandIconLockup; header keeps BrandLogoInline');
}

console.log('all audit notification checks passed');
