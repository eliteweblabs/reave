/**
 * Smoke tests for owner identity, recent Sessions, and deploy-failure reuse.
 * Run: npm run check:agent-awareness
 */
import assert from 'node:assert/strict';
import {
  deployFailureAlertTitle,
  deployFailureServiceName,
  findReusableAlertThread,
  formatOwnerIdentityBlock,
  formatRecentSessionsBlock,
  formatSessionAge,
  isDeployFailureTitle,
  lastAssistantIsUnresolved,
  lastAssistantTurn,
  shouldAutoRunRepairFollowUp,
  titlesMatchAlert,
} from '../src/lib/agentSituationalContext.ts';

assert.equal(deployFailureAlertTitle('calcom-web-app'), 'Deploy failed — calcom-web-app');
assert.equal(deployFailureAlertTitle('  '), 'Deploy failed — service');
assert.equal(deployFailureAlertTitle('?'), 'Deploy failed — service');

assert.equal(deployFailureServiceName({ service: 'calcom-web-app' }), 'calcom-web-app');
assert.equal(
  deployFailureServiceName({
    message: 'Railway deploy failure\nService: calcom-web-app\nProject: Reave',
  }),
  'calcom-web-app',
);
assert.equal(
  deployFailureServiceName({ message: 'Deploy failed — materials-api\n\nGO FIX IT' }),
  'materials-api',
);

assert.equal(titlesMatchAlert('Deploy failed — calcom-web-app', 'deploy failed — calcom-web-app'), true);
assert.equal(isDeployFailureTitle('Deploy failed — calcom-web-app'), true);
assert.equal(isDeployFailureTitle('New project created automatically'), false);

const now = Date.parse('2026-08-21T16:00:00.000Z');
const threads = [
  {
    id: 't1',
    title: 'Deploy failed — calcom-web-app',
    updated_at: '2026-08-21T15:48:00.000Z',
    archived: false,
  },
  {
    id: 't2',
    title: 'Deploy failed — calcom-web-app',
    updated_at: '2026-08-20T10:00:00.000Z',
    archived: false,
  },
  {
    id: 't3',
    title: 'Deploy failed — calcom-web-app',
    updated_at: '2026-08-21T15:50:00.000Z',
    archived: true,
  },
  {
    id: 't4',
    title: 'New project created automatically',
    updated_at: '2026-08-21T13:57:00.000Z',
    archived: false,
  },
];

const hit = findReusableAlertThread(threads, 'Deploy failed — calcom-web-app', now);
assert.equal(hit?.id, 't1');

const staleOnly = findReusableAlertThread(
  [threads[1]!],
  'Deploy failed — calcom-web-app',
  now,
);
assert.equal(staleOnly, null);

const fallback = findReusableAlertThread(threads, 'Deploy failed — service', now);
assert.equal(fallback?.id, 't1');

assert.equal(shouldAutoRunRepairFollowUp({ runActive: true, nowMs: now }), 'suppress-running');
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: true,
    lastAssistantAtMs: now - 2 * 60_000,
    nowMs: now,
  }),
  'suppress-cooldown',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: true,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
  }),
  'run',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: false,
    lastAssistantAtMs: now - 60_000,
    nowMs: now,
  }),
  'suppress-cooldown',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: false,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
    assistantRunCount: 3,
  }),
  'suppress-exhausted',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: false,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
    assistantRunCount: 2,
  }),
  'run',
);

assert.equal(lastAssistantIsUnresolved('Tried logs.\n🚨 UNRESOLVED — missing CALENDSO_ENCRYPTION_KEY'), true);
assert.equal(lastAssistantIsUnresolved('✅ RESOLVED — rollout teardown'), false);
assert.equal(
  lastAssistantTurn([
    { role: 'user', content: 'fail' },
    { role: 'assistant', content: 'looking' },
    { role: 'user', content: 'again' },
  ])?.content,
  'looking',
);

const identity = formatOwnerIdentityBlock({
  companyName: 'reΛVe.app',
  domain: 'reave.app',
  ownerName: 'Tony',
  ownerEmail: 'tony@example.com',
});
assert.match(identity, /You work for reΛVe.app \(reave.app\)/);
assert.match(identity, /Tony <tony@example.com>/);
assert.match(identity, /EVERY Session/);

assert.equal(formatSessionAge('2026-08-21T15:58:00.000Z', now), '2m ago');

const recent = formatRecentSessionsBlock(threads, { currentThreadId: 't1', nowMs: now, limit: 5 });
assert.ok(recent);
assert.match(recent, /Recent Sessions/);
assert.doesNotMatch(recent, /t1/);
assert.match(recent, /New project created automatically/);
assert.equal((recent.match(/Deploy failed — calcom-web-app/g) ?? []).length, 1);

console.log('ok: agent awareness helpers');
