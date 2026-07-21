const activeRuns = new Map<string, AbortController>();

function runKey(userId: string, threadId: string): string {
  return `${userId}:${threadId}`;
}

/** Register (or replace) the in-flight run for a thread; ties optional external abort to it. */
export function registerAgentRun(
  userId: string,
  threadId: string,
  externalSignal?: AbortSignal,
): AbortSignal {
  const key = runKey(userId, threadId);
  cancelAgentRun(userId, threadId);

  const controller = new AbortController();
  activeRuns.set(key, controller);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return controller.signal;
}

export function cancelAgentRun(userId: string, threadId: string): boolean {
  const key = runKey(userId, threadId);
  const controller = activeRuns.get(key);
  if (!controller) return false;
  controller.abort();
  activeRuns.delete(key);
  return true;
}

export function isAgentRunActive(userId: string, threadId: string): boolean {
  return activeRuns.has(runKey(userId, threadId));
}

export function clearAgentRun(userId: string, threadId: string): void {
  activeRuns.delete(runKey(userId, threadId));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Agent run aborted', 'AbortError');
  }
}
