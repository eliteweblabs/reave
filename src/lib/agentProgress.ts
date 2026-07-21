export type AgentProgressPhase = 'thinking' | 'tool' | 'complete';

export type AgentProgress = {
  phase: AgentProgressPhase;
  tool?: string;
  toolLabel?: string;
  round?: number;
  startedAt: number;
  updatedAt: number;
  partialText?: string;
};

const store = new Map<string, AgentProgress>();

function progressKey(userId: string, threadId: string): string {
  return `${userId}:${threadId}`;
}

export function setAgentProgress(
  userId: string,
  threadId: string,
  update: Partial<Omit<AgentProgress, 'startedAt' | 'updatedAt'>> & { phase: AgentProgressPhase },
): void {
  const key = progressKey(userId, threadId);
  const existing = store.get(key);
  const now = Date.now();
  store.set(key, {
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    ...existing,
    ...update,
  });
}

export function appendAgentPartialText(userId: string, threadId: string, text: string): void {
  const key = progressKey(userId, threadId);
  const existing = store.get(key);
  if (!existing) return;
  store.set(key, {
    ...existing,
    partialText: text,
    updatedAt: Date.now(),
  });
}

export function getAgentProgress(userId: string, threadId: string): AgentProgress | null {
  return store.get(progressKey(userId, threadId)) ?? null;
}

export function clearAgentProgress(userId: string, threadId: string): void {
  store.delete(progressKey(userId, threadId));
}
