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
import {
  defaultEmailFilterRuleStatus,
  defaultEmailFilterRuleTitle,
  planEmailFilterRuleWrite,
} from '../src/lib/emailFilterRuleWrite';

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

assert.equal(defaultEmailFilterRuleStatus({ statusRaw: '', forwardTo: null }), 'DELETE');
assert.equal(
  defaultEmailFilterRuleStatus({ statusRaw: '', forwardTo: 'jk@capcofire.com' }),
  'CUSTOM',
);
assert.equal(
  defaultEmailFilterRuleStatus({ statusRaw: 'DELETE', forwardTo: 'jk@capcofire.com' }),
  'DELETE',
);
assert.equal(
  defaultEmailFilterRuleTitle({
    title: '',
    sender: 'upwork@t.upwork.com',
    phrases: ['upwork@t.upwork.com'],
    forwardTo: 'jk@capcofire.com',
  }),
  'Forward upwork@t.upwork.com → jk@capcofire.com',
);

assert.equal(
  planEmailFilterRuleWrite({
    existing: { forwardTo: null, status: 'DELETE', catalog: false },
    forwardTo: 'jk@capcofire.com',
    statusRaw: '',
  }),
  'update',
);
assert.equal(
  planEmailFilterRuleWrite({
    existing: { forwardTo: 'jk@capcofire.com', status: 'CUSTOM', catalog: false },
    forwardTo: 'jk@capcofire.com',
    statusRaw: '',
  }),
  'skip',
);
assert.equal(
  planEmailFilterRuleWrite({
    existing: { forwardTo: null, status: 'DELETE', catalog: true },
    forwardTo: 'jk@capcofire.com',
    statusRaw: '',
  }),
  'create',
);
assert.equal(
  planEmailFilterRuleWrite({
    existing: null,
    forwardTo: 'jk@capcofire.com',
    statusRaw: '',
  }),
  'create',
);

{
  const forward: EmailRule = {
    status: 'CUSTOM',
    phrases: ['upwork@t.upwork.com'],
    matchMode: 'any',
    fields: ['from'],
    notify: false,
    enabled: true,
    forwardTo: 'jk@capcofire.com',
  };
  const upwork = {
    from: 'Upwork <upwork@t.upwork.com>',
    subject: 'Talent Marketplace',
    text: 'A new job was posted.',
  };
  const result = classifyEmail(upwork, [forward, ...DEFAULT_RULES]);
  assert.equal(result.status, 'CUSTOM');
  assert.equal(result.matched?.forwardTo, 'jk@capcofire.com');
}

{
  const promo = {
    from: 'Cursor <team@mail.cursor.com>',
    subject: 'Cursor code hosting is here',
    text: 'Origin is available. To unsubscribe click here. Manage your email preferences anytime.',
  };
  const junked = classifyEmail(promo, DEFAULT_RULES);
  assert.equal(junked.status, 'DELETE');
  const kept = classifyEmail(promo, DEFAULT_RULES, true, { knownContact: true });
  assert.equal(kept.status, 'UNMATCHED');
}

console.log('verify-email-rule-priority: ok');
