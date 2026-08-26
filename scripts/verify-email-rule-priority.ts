/**
 * Verify first-match short-circuit and sender-silent priority over NEEDS_CHECK.
 * Run: npx tsx scripts/verify-email-rule-priority.ts
 */
import assert from 'node:assert/strict';
import {
  classifyEmail,
  DEFAULT_RULES,
  findKeywordCollidingRule,
  formatKeywordCollisionError,
  isCatalogMarketingDeleteRule,
  isRepoCatalogRule,
  isSilentTriageStatus,
  matchingCatalogDefinition,
  type EmailRule,
} from '../src/lib/emailRules';
import {
  defaultEmailFilterRuleStatus,
  defaultEmailFilterRuleTitle,
  planEmailFilterRuleWrite,
  ruleAllowsAutoProject,
} from '../src/lib/emailFilterRuleWrite';
import {
  applyRepoCatalog,
  normalizeEmailRuleSortOrder,
  sortOrderForNewRule,
  type EmailRuleRecord,
  type EmailRulesConfig,
} from '../src/lib/emailRuleStore';
import {
  deletedOrJunkedEmailBlocksNotification,
  isJunkClassification,
  shouldHardDeleteOnDeleteRule,
} from '../src/lib/emailJunkNotifyInvariant';
import { mapAiLabelToOutcome } from '../src/lib/emailAiClassify';
import { isRoutineNewLoginNotice, looksLikeAuthLinkEmail } from '../src/lib/emailAuthLinkParser';
import { isLikelyOtpSender, looksLikeOtpEmail } from '../src/lib/emailOtpParser';

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

function testRule(partial: Partial<EmailRuleRecord> & Pick<EmailRuleRecord, 'id' | 'scope' | 'sortOrder'>): EmailRuleRecord {
  return {
    title: partial.title || partial.id,
    status: partial.status || 'DELETE',
    phrases: partial.phrases || ['x'],
    matchMode: 'any',
    fields: ['body'],
    notify: false,
    enabled: true,
    ...partial,
  };
}

{
  const mixed = [
    testRule({ id: 'p1', scope: 'personal', sortOrder: 0 }),
    testRule({ id: 'u1', scope: 'universal', sortOrder: 1 }),
    testRule({ id: 'p2', scope: 'personal', sortOrder: 2 }),
    testRule({ id: 'u2', scope: 'universal', sortOrder: 3 }),
  ];
  const { rules, changed } = normalizeEmailRuleSortOrder(mixed);
  assert.equal(changed, true);
  assert.deepEqual(
    rules.map((r) => [r.id, r.sortOrder, r.scope]),
    [
      ['u1', 0, 'universal'],
      ['u2', 1, 'universal'],
      ['p1', 2, 'personal'],
      ['p2', 3, 'personal'],
    ],
  );
}

{
  const already = normalizeEmailRuleSortOrder([
    testRule({ id: 'u0', scope: 'universal', sortOrder: 0 }),
    testRule({ id: 'p1', scope: 'personal', sortOrder: 1 }),
  ]);
  assert.equal(already.changed, false);
}

{
  const universals = Array.from({ length: 13 }, (_, i) =>
    testRule({ id: `u${i}`, scope: 'universal', sortOrder: i }),
  );
  const personals = [
    testRule({ id: 'p13', scope: 'personal', sortOrder: 13 }),
    testRule({ id: 'p14', scope: 'personal', sortOrder: 14 }),
  ];
  const config: EmailRulesConfig = {
    notifyOnUnmatched: false,
    rules: [...universals, ...personals],
  };
  const next = sortOrderForNewRule(config, 'universal', false);
  assert.equal(next, 13);
  assert.equal(config.rules.find((r) => r.id === 'p13')?.sortOrder, 14);
  assert.equal(config.rules.find((r) => r.id === 'p14')?.sortOrder, 15);
}

{
  const personal: EmailRule = {
    status: 'DELETE',
    scope: 'personal',
    phrases: ['Security alert'],
    matchMode: 'any',
    fields: ['subject'],
    notify: false,
    enabled: true,
  };
  const universal: EmailRule = {
    status: 'NEEDS_CHECK',
    scope: 'universal',
    phrases: ['Security alert'],
    matchMode: 'any',
    fields: ['subject'],
    notify: true,
    enabled: true,
  };
  const result = classifyEmail(googleSecurity, [personal, universal]);
  assert.equal(result.status, 'NEEDS_CHECK');
}

assert.equal(deletedOrJunkedEmailBlocksNotification(null), true);
assert.equal(deletedOrJunkedEmailBlocksNotification({ category: 'junk', status: 'DELETE' }), true);
assert.equal(deletedOrJunkedEmailBlocksNotification({ category: 'internal', status: 'AUTO_ARCHIVED' }), true);
assert.equal(deletedOrJunkedEmailBlocksNotification({ category: 'alert', status: 'NEEDS_CHECK' }), false);

{
  const facebookLogin = {
    from: 'security@facebookmail.com',
    subject: 'Did you just log in near Beverly on a new device?',
    text: 'Someone just logged into your Facebook account near Beverly. https://www.facebook.com/n/?login_alerts',
  };
  assert.equal(isRoutineNewLoginNotice(facebookLogin), true);
  assert.equal(looksLikeAuthLinkEmail(facebookLogin), false);
  assert.equal(isLikelyOtpSender(facebookLogin.from), false);
  assert.equal(looksLikeOtpEmail(facebookLogin), false);
  assert.equal(classifyEmail(facebookLogin, DEFAULT_RULES).status, 'DELETE');
  assert.equal(classifyEmail(facebookLogin, DEFAULT_RULES).notify, false);
}

assert.equal(
  isJunkClassification({ category: 'junk', action: 'junk', status: 'DELETE' }),
  true,
);
assert.equal(
  isJunkClassification({ category: 'junk', action: 'deleted', status: 'DELETE' }),
  true,
);
assert.equal(
  isJunkClassification({ category: 'auto_deleted', action: 'deleted', status: 'DELETE' }),
  true,
);
assert.equal(
  isJunkClassification({ category: 'alert', action: 'alert', status: 'NEEDS_CHECK' }),
  false,
);

assert.equal(
  shouldHardDeleteOnDeleteRule({
    category: 'junk',
    inboxStatus: 'DELETE',
    ruleStatus: 'DELETE',
  }),
  true,
);
assert.equal(
  shouldHardDeleteOnDeleteRule({
    category: 'junk',
    inboxStatus: 'JUNK',
    ruleStatus: 'UNMATCHED',
  }),
  false,
);
assert.equal(
  shouldHardDeleteOnDeleteRule({
    category: 'receipt',
    inboxStatus: 'RECEIPT',
    ruleStatus: 'DELETE',
  }),
  false,
);
assert.equal(
  shouldHardDeleteOnDeleteRule({
    category: 'junk',
    inboxStatus: 'DELETE',
    ruleStatus: 'DELETE',
    isVerificationCode: true,
  }),
  false,
);
assert.equal(mapAiLabelToOutcome('junk').status, 'JUNK');

{
  const shipmentDef = DEFAULT_RULES.find((r) =>
    r.phrases.some((p) => /shipment\s*tracked/i.test(p)),
  );
  assert.ok(shipmentDef);
  assert.ok((shipmentDef!.fields || []).includes('from'));
  const shipmentRow: EmailRuleRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Shipment tracked',
    status: 'AUTO_ARCHIVED',
    scope: 'universal',
    description: shipmentDef!.description,
    phrases: [...shipmentDef!.phrases],
    matchMode: 'any',
    fields: ['subject', 'body', 'from'],
    notify: false,
    enabled: true,
    sortOrder: 8,
    hitCount: 4,
  };
  assert.equal(isRepoCatalogRule(shipmentRow), true);
  assert.equal(matchingCatalogDefinition(shipmentRow)?.status, 'AUTO_ARCHIVED');

  const senderBlock: EmailRuleRecord = {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Amazon sender',
    status: 'AUTO_ARCHIVED',
    scope: 'universal',
    phrases: ['shipment-tracking@amazon.com'],
    matchMode: 'any',
    fields: ['from'],
    notify: false,
    enabled: true,
    sortOrder: 9,
  };
  assert.equal(isRepoCatalogRule(senderBlock), false);

  const clones = Array.from({ length: 12 }, (_, i) => ({
    ...shipmentRow,
    id: `33333333-3333-3333-3333-3333333333${String(i).padStart(2, '0')}`,
    hitCount: i === 3 ? 20 : 1,
    createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const first = applyRepoCatalog(clones);
  assert.equal(
    first.rules.filter((r) => matchingCatalogDefinition(r) === matchingCatalogDefinition(shipmentRow))
      .length,
    1,
    'shipment clones must collapse to one catalog row',
  );
  const keeper = first.rules.find((r) => matchingCatalogDefinition(r) === matchingCatalogDefinition(shipmentRow));
  assert.ok(keeper);
  assert.equal(keeper!.hitCount, 20 + 11);
  const second = applyRepoCatalog(first.rules);
  assert.equal(second.changed, false, 'catalog sync must be idempotent for shipment-from');
  assert.equal(
    second.rules.filter((r) => matchingCatalogDefinition(r) === matchingCatalogDefinition(shipmentRow))
      .length,
    1,
  );
}

{
  const shipment = {
    id: 'ship-1',
    title: 'Shipment tracked',
    phrases: ['shipment tracked', 'shipment tracking'],
  };
  const receipt = {
    id: 'receipt-1',
    title: 'Expense receipt',
    phrases: ['your receipt', 'order confirmation'],
  };
  const rules = [shipment, receipt];

  const sameKeywordsDifferentAction = findKeywordCollidingRule(rules, [
    'Shipment Tracked',
    'package delivered',
  ]);
  assert.ok(sameKeywordsDifferentAction);
  assert.equal(sameKeywordsDifferentAction!.rule.id, 'ship-1');
  assert.deepEqual(sameKeywordsDifferentAction!.phrases, ['shipment tracked']);

  assert.equal(
    findKeywordCollidingRule(rules, ['package delivered', 'out for delivery']),
    null,
  );
  assert.equal(findKeywordCollidingRule(rules, ['shipment tracked'], { excludeId: 'ship-1' }), null);
  assert.equal(findKeywordCollidingRule(rules, ['  ', '']), null);
  assert.equal(findKeywordCollidingRule(rules, []), null);

  const msg = formatKeywordCollisionError('Shipment tracked', ['shipment tracked']);
  assert.match(msg, /Shipment tracked/);
  assert.match(msg, /shipment tracked/);
}

console.log('verify-email-rule-priority: ok');
