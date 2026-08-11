import { getAgentProgress } from './agentProgress';
import {
  clearAgentRunLease,
  heartbeatAgentRunLease,
  upsertAgentRunLease,
} from './pgAgentRunLeases';

const activeRuns = new Map<string, AbortController>();
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

const HEARTBEAT_MS = 5_000;

function runKey(userId: string, threadId: string): string {
  return `${userId}:${threadId}`;
}

function stopHeartbeat(key: string): void {
  const timer = heartbeats.get(key);
  if (timer) {
    clearInterval(timer);
    heartbeats.delete(key);
  }
}

function startHeartbeat(userId: string, threadId: string): void {
  const key = runKey(userId, threadId);
  stopHeartbeat(key);
  // Intentionally NOT unref'd — during Railway drain these timers (and the
  // activeRuns map) are what keep the event loop alive until the turn finishes.
  const timer = setInterval(() => {
    if (!activeRuns.has(key)) {
      stopHeartbeat(key);
      return;
    }
    const progress = getAgentProgress(userId, threadId);
    void heartbeatAgentRunLease(userId, threadId, progress);
  }, HEARTBEAT_MS);
  heartbeats.set(key, timer);
}

/** How many agent turns are still owned by this process (drain waiter uses this). */
export function countActiveAgentRuns(): number {
  return activeRuns.size;
}

/** Register (or replace) the in-flight run for a thread; ties optional external abort to it. */
export function registerAgentRun(
  userId: string,
  threadId: string,
  externalSignal?: AbortSignal,
): AbortSignal {
  const key = runKey(userId, threadId);
  const prior = activeRuns.get(key);
  if (prior) prior.abort();

  const controller = new AbortController();
  activeRuns.set(key, controller);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  void upsertAgentRunLease(userId, threadId);
  startHeartbeat(userId, threadId);

  return controller.signal;
}

/** Abort the run; leaves the registry entry until clearAgentRun (settle finally). */
export function cancelAgentRun(userId: string, threadId: string): boolean {
  const key = runKey(userId, threadId);
  const controller = activeRuns.get(key);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isAgentRunActive(userId: string, threadId: string): boolean {
  return activeRuns.has(runKey(userId, threadId));
}

/** Thread ids with an in-flight agent run for this user — powers the sidebar "working" indicator. */
export function listActiveRunThreadIds(userId: string): string[] {
  const prefix = `${userId}:`;
  const ids: string[] = [];
  for (const key of activeRuns.keys()) {
    if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
  }
  return ids;
}

/**
 * Drop local run state and the durable lease. Pass `signal` from the run that is
 * finishing so a superseded turn cannot clear a newer registration.
 */
export function clearAgentRun(userId: string, threadId: string, signal?: AbortSignal): void {
  const key = runKey(userId, threadId);
  const current = activeRuns.get(key);
  if (signal && current && current.signal !== signal) {
    return;
  }
  stopHeartbeat(key);
  activeRuns.delete(key);
  void clearAgentRunLease(userId, threadId);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Agent run aborted', 'AbortError');
  }
}
