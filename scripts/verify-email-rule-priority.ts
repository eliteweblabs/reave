/**
 * Verify first-match short-circuit and sender-silent priority over NEEDS_CHECK.
 * Run: npx tsx scripts/verify-email-rule-priority.ts
 */
import assert from 'node:assert/strict';
import {
  classifyEmail,
  DEFAULT_RULES,
  isSilentTriageStatus,
  type EmailRule,
} from '../src/lib/emailRules';

const googleSecurity = {
  from: 'Google <no-reply@accounts.google.com>',
  subject: 'Security alert',
  text: 'A new sign-in on Mac sen@eliteweblabs.com We noticed a new sign-in to your Google Account.',
};

// Default table alone: NEEDS_CHECK no longer matches bare "Security alert"
{
  const result = classifyEmail(googleSecurity, DEFAULT_RULES);
  assert.notEqual(result.status, 'NEEDS_CHECK');
}

// Sender-specific DELETE before NEEDS_CHECK wins; reverse order loses.
{
  const silent: EmailRule = {
    status: 'DELETE',
    phrases: ['no-reply@accounts.google.com', 'Security alert'],
    matchMode: 'all',
    fields: ['from', 'subject', 'body'],
    notify: false,
    enabled: true,
  };
  const needsCheck = DEFAULT_RULES.find((r) => r.status === 'NEEDS_CHECK')!;
  const win = classifyEmail(googleSecurity, [silent, needsCheck]);
  assert.equal(win.status, 'DELETE');
  assert.equal(win.notify, false);

  const lose = classifyEmail(googleSecurity, [
    { ...needsCheck, phrases: [...needsCheck.phrases, 'Security alert'] },
    silent,
  ]);
  assert.equal(lose.status, 'NEEDS_CHECK');
  assert.equal(lose.notify, true);
}

assert.equal(isSilentTriageStatus('DELETE'), true);
assert.equal(isSilentTriageStatus('NEEDS_CHECK'), false);

console.log('verify-email-rule-priority: ok');
