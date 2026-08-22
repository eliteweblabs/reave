/**
 * Verify first-match short-circuit and sender-silent priority over NEEDS_CHECK.
 * Run: npx tsx scripts/verify-email-rule-priority.ts
 */
import assert from 'node:assert/strict';
import {
  classifyEmail,
  DEFAULT_RULES,
  isCatalogMarketingDeleteRule,
  isSilentTriageStatus,
  type EmailRule,
} from '../src/lib/emailRules';
import {
  defaultEmailFilterRuleStatus,
  defaultEmailFilterRuleTitle,
  planEmailFilterRuleWrite,
  ruleAllowsAutoProject,
} from '../src/lib/emailFilterRuleWrite';
import { applyRepoCatalog, type EmailRuleRecord } from '../src/lib/emailRuleStore';
import { deletedOrJunkedEmailBlocksNotification } from '../src/lib/emailJunkNotifyInvariant';

const googleSecurity = {
  from: 'Google <no-reply@accounts.google.com>',
  subject: 'Security alert',
  text: 'A new sign-in on Mac sen@eliteweblabs.com We noticed a new sign-in to your Google Account.',
};

// Default table: routine new-sign-in language is silent DELETE, not NEEDS_CHECK.
{
  const result = classifyEmail(googleSecurity, DEFAULT_RULES);
  assert.equal(result.status, 'DELETE');
  assert.equal(result.notify, false);
  assert.ok(!isCatalogMarketingDeleteRule(result.matched!));
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
assert.equal(
  planEmailFilterRuleWrite({
    existing: { forwardTo: 'jk@capcofire.com', createProject: false, status: 'CUSTOM', catalog: false },
    forwardTo: 'jk@capcofire.com',
    createProject: true,
    statusRaw: '',
  }),
  'update',
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
  assert.equal(ruleAllowsAutoProject(result.matched), false);
  assert.equal(ruleAllowsAutoProject({ ...forward, createProject: true }), true);
  assert.equal(ruleAllowsAutoProject({}), true);
  assert.equal(ruleAllowsAutoProject({ forwardTo: null }), true);
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

{
  const marketing = DEFAULT_RULES.find(
    (r) => r.status === 'DELETE' && isCatalogMarketingDeleteRule(r),
  );
  const signIn = DEFAULT_RULES.find(
    (r) => r.status === 'DELETE' && r.phrases.some((p) => p === 'detected a new sign-in'),
  );
  assert.ok(marketing);
  assert.ok(signIn);
  assert.equal(isCatalogMarketingDeleteRule(signIn!), false);
}

{
  const marketingOnly: EmailRuleRecord = {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Marketing trash',
    status: 'DELETE',
    scope: 'universal',
    description: 'Marketing trash — file silently, no alert.',
    phrases: ['unsubscribe', 'opt out'],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: false,
    enabled: true,
    sortOrder: 10,
  };
  const synced = applyRepoCatalog([marketingOnly]);
  assert.equal(synced.changed, true);
  const catalogDeletes = synced.rules.filter(
    (r) =>
      r.scope === 'universal' &&
      r.status === 'DELETE' &&
      !(r.fields || []).includes('from'),
  );
  assert.ok(catalogDeletes.length >= 2, 'sign-in DELETE must seed as its own catalog row');
  assert.ok(catalogDeletes.some((r) => r.phrases.includes('detected a new sign-in')));
  assert.ok(catalogDeletes.some((r) => r.phrases.includes('unsubscribe')));
}

assert.equal(deletedOrJunkedEmailBlocksNotification(null), true);
assert.equal(deletedOrJunkedEmailBlocksNotification({ category: 'junk', status: 'DELETE' }), true);
assert.equal(deletedOrJunkedEmailBlocksNotification({ category: 'alert', status: 'NEEDS_CHECK' }), false);

console.log('verify-email-rule-priority: ok');
