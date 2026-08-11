/**
 * Verifies deploy-drain helpers: lease freshness and wait-for-active-runs.
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-agent-run-drain.ts
 */
import assert from 'node:assert/strict';
import {
  AGENT_RUN_LEASE_STALE_MS,
  agentRunLeaseToProgress,
  isAgentRunLeaseFresh,
} from '../src/lib/pgAgentRunLeases.ts';
import {
  clearAgentRun,
  countActiveAgentRuns,
  registerAgentRun,
} from '../src/lib/agentRunControl.ts';
import { waitForActiveAgentRuns } from '../src/lib/processDrain.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

await test('fresh lease heartbeat is alive; stale is not', () => {
  const now = Date.now();
  assert.equal(isAgentRunLeaseFresh(new Date(now).toISOString(), now), true);
  assert.equal(
    isAgentRunLeaseFresh(new Date(now - AGENT_RUN_LEASE_STALE_MS + 1_000).toISOString(), now),
    true,
  );
  assert.equal(
    isAgentRunLeaseFresh(new Date(now - AGENT_RUN_LEASE_STALE_MS - 1_000).toISOString(), now),
    false,
  );
});

await test('lease progress mapping keeps thinking phase by default', () => {
  const progress = agentRunLeaseToProgress({
    userId: 'u',
    threadId: 't',
    replicaId: 'r',
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    phase: null,
    tool: null,
    toolLabel: null,
    round: null,
    concurrent: null,
    partialText: 'partial…',
  });
  assert.ok(progress);
  assert.equal(progress!.phase, 'thinking');
  assert.equal(progress!.partialText, 'partial…');
});

await test('countActiveAgentRuns tracks register/clear with signal ownership', () => {
  const before = countActiveAgentRuns();
  const signal = registerAgentRun('drain-user', 'thread-a');
  assert.equal(countActiveAgentRuns(), before + 1);
  const superseded = registerAgentRun('drain-user', 'thread-a');
  assert.equal(countActiveAgentRuns(), before + 1);
  // Old signal must not clear the newer registration.
  clearAgentRun('drain-user', 'thread-a', signal);
  assert.equal(countActiveAgentRuns(), before + 1);
  clearAgentRun('drain-user', 'thread-a', superseded);
  assert.equal(countActiveAgentRuns(), before);
});

await test('waitForActiveAgentRuns resolves once the run is cleared', async () => {
  const signal = registerAgentRun('drain-user', 'thread-b');
  const wait = waitForActiveAgentRuns(2_000);
  setTimeout(() => clearAgentRun('drain-user', 'thread-b', signal), 80);
  const result = await wait;
  assert.equal(result.drained, true);
  assert.equal(result.remaining, 0);
});

await test('waitForActiveAgentRuns times out when a run never clears', async () => {
  const signal = registerAgentRun('drain-user', 'thread-c');
  const result = await waitForActiveAgentRuns(200);
  assert.equal(result.drained, false);
  assert.ok(result.remaining >= 1);
  clearAgentRun('drain-user', 'thread-c', signal);
});

console.log('verify-agent-run-drain');
for (const line of results) console.log(line);
if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall ok');
