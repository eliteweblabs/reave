/**
 * Durable recall store: Postgres when DATABASE_URL is set, JSON file otherwise.
 */

import { MAX_INJECTED_MEMORIES, formatMemoriesForPrompt, type AgentMemory, type MemoryKind, type MemoryScope, type MemorySource } from './agentMemory';
import {
  dbCountMemories,
  dbDeleteMemory,
  dbListMemories,
  dbTouchMemories,
  dbUpsertMemory,
  isMemoryDbConfigured,
} from './pgAgentMemories';
import {
  fileCountMemories,
  fileDeleteMemory,
  fileListMemories,
  fileTouchMemories,
  fileUpsertMemory,
} from './fileAgentMemories';

export { isMemoryDbConfigured };

export function memoryStorageBackend(): 'postgres' | 'files' {
  return isMemoryDbConfigured() ? 'postgres' : 'files';
}

export async function storeListMemories(opts: {
  userId: string;
  kind?: MemoryKind;
  query?: string;
  limit?: number;
}): Promise<AgentMemory[]> {
  if (memoryStorageBackend() === 'postgres') {
    return (await dbListMemories(opts)) ?? [];
  }
  return fileListMemories(opts);
}

export async function storeCountMemories(userId: string): Promise<number> {
  if (memoryStorageBackend() === 'postgres') {
    return (await dbCountMemories(userId)) ?? 0;
  }
  return fileCountMemories(userId);
}

export async function storeUpsertMemory(input: {
  userId: string;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  content: string;
  source: MemorySource;
  sourceThreadId?: string | null;
}): Promise<{ ok: true; memory: AgentMemory; created: boolean } | { ok: false; error: string }> {
  if (memoryStorageBackend() === 'postgres') return dbUpsertMemory(input);
  return fileUpsertMemory(input);
}

export async function storeDeleteMemory(opts: {
  userId: string;
  id?: number;
  key?: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  if (memoryStorageBackend() === 'postgres') return dbDeleteMemory(opts);
  return fileDeleteMemory(opts);
}

export async function storeTouchMemories(ids: number[]): Promise<void> {
  if (memoryStorageBackend() === 'postgres') {
    await dbTouchMemories(ids);
    return;
  }
  fileTouchMemories(ids);
}

/** Compact block for the agent system prompt (dynamic suffix — not prompt-cached). */
export async function formatDurableRecallBlock(userId?: string | null): Promise<string | null> {
  const id = userId?.trim();
  if (!id) return null;
  const total = await storeCountMemories(id);
  if (!total) return null;
  const memories = await storeListMemories({ userId: id, limit: MAX_INJECTED_MEMORIES });
  return formatMemoriesForPrompt(memories, total);
}
