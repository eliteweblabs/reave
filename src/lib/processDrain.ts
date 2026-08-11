/**
 * Railway deploy drain — keep the process alive after SIGTERM until in-flight
 * agent runs finish (or the drain budget expires).
 *
 * RAILWAY_DEPLOYMENT_DRAINING_SECONDS only delays SIGKILL; without this handler
 * Node exits immediately and mid-turn chats die. Import this module once at
 * process start (middleware / health / agent run control) so the listeners are
 * installed before a deploy tears the replica down.
 */

import { countActiveAgentRuns } from './agentRunControl';
import { serverEnv } from './serverEnv';

let draining = false;
let installed = false;
let drainWait: Promise<void> | null = null;

const DEFAULT_DRAIN_SECONDS = 600;
/** Leave a little headroom before Railway's SIGKILL. */
const DRAIN_KILL_BUFFER_MS = 3_000;
const POLL_MS = 500;

export function isProcessDraining(): boolean {
  return draining;
}

/** Seconds Railway will wait between SIGTERM and SIGKILL (service var or default). */
export function processDrainBudgetSeconds(): number {
  const raw = serverEnv('RAILWAY_DEPLOYMENT_DRAINING_SECONDS')?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return DEFAULT_DRAIN_SECONDS;
}

export function processDrainBudgetMs(): number {
  return Math.max(5_000, processDrainBudgetSeconds() * 1000 - DRAIN_KILL_BUFFER_MS);
}

export async function waitForActiveAgentRuns(maxMs: number): Promise<{
  drained: boolean;
  remaining: number;
  waitedMs: number;
}> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const remaining = countActiveAgentRuns();
    if (remaining <= 0) {
      return { drained: true, remaining: 0, waitedMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return {
    drained: false,
    remaining: countActiveAgentRuns(),
    waitedMs: Date.now() - started,
  };
}

async function handleDrainSignal(signal: string): Promise<void> {
  if (draining) return;
  draining = true;
  const budgetMs = processDrainBudgetMs();
  const active = countActiveAgentRuns();
  console.info(
    `[drain] ${signal} received — waiting up to ${Math.round(budgetMs / 1000)}s for ${active} active agent run(s)`,
  );

  const result = await waitForActiveAgentRuns(budgetMs);
  if (result.drained) {
    console.info(`[drain] all agent runs finished after ${result.waitedMs}ms — exiting`);
  } else {
    console.warn(
      `[drain] budget exhausted with ${result.remaining} run(s) still active after ${result.waitedMs}ms — exiting`,
    );
  }
  process.exit(0);
}

/** Idempotent — safe to call from multiple import sites. */
export function installProcessDrainHandlers(): void {
  if (installed) return;
  if (typeof process === 'undefined' || typeof process.on !== 'function') return;
  installed = true;

  const onSignal = (signal: string) => {
    if (drainWait) return;
    drainWait = handleDrainSignal(signal).catch((err) => {
      console.error('[drain] handler failed:', err);
      process.exit(1);
    });
  };

  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}

// Install on import so the first loaded chat/health module arms the handlers.
installProcessDrainHandlers();
