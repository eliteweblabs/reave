/**
 * Guard: failed Siri/Digital audits must not ship as "Audit Ready"
 * with a deploy banner or raw Anthropic button JSON in the body.
 * Run: npm run check:audit-notifications
 */
import assert from 'node:assert/strict';
import { renderButton } from '../src/lib/chatResponseRenderer.ts';
import {
  auditLabelFromTitle,
  auditResearchFailureReason,
  extractAuditProposalSummary,
  formatAuditFailedNotification,
  formatAuditReadyNotification,
  isSiriAuditPushAlert,
  normalizePushAlertCopy,
  stripNotificationDecorations,
} from '../src/lib/notificationFormat.ts';
import { isAuditWorkInProgress } from '../src/lib/auditReportCard.ts';

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

console.log('all audit notification checks passed');
