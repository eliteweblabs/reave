/**
 * Smoke tests for owner identity, recent Sessions, and deploy-failure reuse.
 * Run: npm run check:agent-awareness
 */
import assert from 'node:assert/strict';
import { isAgentLlmBlockedReply } from '../src/lib/anthropicMessages.ts';
import {
  assistantRepeatsLastReply,
  deployFailureAlertTitle,
  deployFailureServiceName,
  deploymentIdSeenInThread,
  findReusableAlertThread,
  formatOwnerIdentityBlock,
  formatRecentSessionsBlock,
  formatSessionAge,
  isDeployFailureTitle,
  isDockerImageRailwayService,
  lastAssistantIsAgentBlocked,
  lastAssistantIsResolved,
  lastAssistantIsUnresolved,
  lastAssistantTurn,
  shouldAutoRunRepairFollowUp,
  titlesMatchAlert,
} from '../src/lib/agentSituationalContext.ts';

import { isDeployFailureAutoRepairEnabled } from '../src/lib/deployFailureChat.ts';

assert.equal(isDeployFailureAutoRepairEnabled(), false, 'auto-repair off unless DEPLOY_FAILURE_AUTO_REPAIR=1');
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
assert.equal(isDockerImageRailwayService('calcom-web-app'), true);
assert.equal(isDockerImageRailwayService('reave'), false);

assert.ok(
  isAgentLlmBlockedReply(
    'Anthropic error (401): {"error":{"code":"AUTH_002","message":"Invalid API key"}}',
  ),
);
assert.ok(lastAssistantIsAgentBlocked('OpenRouter rejected the API key (401).'));
assert.equal(lastAssistantIsResolved('✅ RESOLVED — rollout teardown'), true);

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
    lastAssistantBlocked: true,
    nowMs: now,
  }),
  'suppress-agent-blocked',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantUnresolved: true,
    lastAssistantAtMs: now - 2 * 60_000,
    nowMs: now,
  }),
  'suppress-unresolved',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    lastAssistantResolved: true,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
  }),
  'suppress-resolved',
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
    duplicateDeployment: true,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
  }),
  'suppress-duplicate-deploy',
);
assert.equal(
  shouldAutoRunRepairFollowUp({
    runActive: false,
    repairService: 'calcom-web-app',
    railwayVarRedeploys: 2,
    lastAssistantAtMs: now - 20 * 60_000,
    nowMs: now,
  }),
  'suppress-railway-vars',
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
assert.equal(
  lastAssistantTurn([
    { role: 'user', content: 'fail' },
    { role: 'assistant', content: 'looking' },
    { role: 'user', content: 'again' },
  ])?.content,
  'looking',
);

assert.equal(
  deploymentIdSeenInThread(
    [{ role: 'user', content: 'Deployment: dep-abc\nfailed' }],
    'dep-abc',
  ),
  true,
);

const repeatTurns = [
  { role: 'user', content: 'a' },
  {
    role: 'assistant',
    content: `${'x'.repeat(50)} same fix applied via set_railway_variables for calcom-web-app end`,
  },
  { role: 'user', content: 'b' },
  {
    role: 'assistant',
    content: `${'x'.repeat(50)} same fix applied via set_railway_variables for calcom-web-app end`,
  },
];
assert.equal(assistantRepeatsLastReply(repeatTurns), true);

const identity = formatOwnerIdentityBlock({
  companyName: 'reave.app',
  domain: 'reave.app',
  ownerName: 'Tony',
  ownerEmail: 'tony@example.com',
});
assert.match(identity, /You work for reave.app \(reave.app\)/);
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
