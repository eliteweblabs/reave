import { projectRoot } from './projectRoot';
/**
 * JSON-file durable recall for local/dev when DATABASE_URL is unset.
 * Writes live under src/knowledge/ until the next deploy.
 */

import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import {
  memoriesAreSimilar,
  normalizeMemoryContent,
  normalizeMemoryKey,
  normalizeMemoryKind,
  normalizeMemoryScope,
  type AgentMemory,
  type MemoryKind,
  type MemoryScope,
  type MemorySource,
} from './agentMemory';

type FilePayload = { nextId: number; memories: AgentMemory[] };


function memoriesPath(): string {
  const dir =
    process.env.AGENT_MEMORIES_DIR?.trim() || join(projectRoot(), 'src', 'knowledge');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'agent-memories.json');
}

function emptyPayload(): FilePayload {
  return { nextId: 1, memories: [] };
}

function readPayload(): FilePayload {
  const path = memoriesPath();
  if (!existsSync(path)) return emptyPayload();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as FilePayload;
    if (!parsed || !Array.isArray(parsed.memories)) return emptyPayload();
    return {
      nextId: Number(parsed.nextId) || parsed.memories.length + 1,
      memories: parsed.memories,
    };
  } catch {
    return emptyPayload();
  }
}

function writePayload(payload: FilePayload): void {
  writeFileSync(memoriesPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function visibleToUser(memory: AgentMemory, userId: string): boolean {
  return memory.scope === 'install' || memory.user_id === userId;
}

export function fileListMemories(opts: {
  userId: string;
  kind?: MemoryKind;
  query?: string;
  limit?: number;
}): AgentMemory[] {
  const limit = Math.min(Math.max(1, opts.limit ?? 80), 200);
  const q = opts.query?.trim().toLowerCase();
  return readPayload()
    .memories.filter((m) => visibleToUser(m, opts.userId))
    .filter((m) => (opts.kind ? m.kind === opts.kind : true))
    .filter((m) =>
      q ? m.key.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) : true,
    )
    .sort((a, b) => {
      if (b.hit_count !== a.hit_count) return b.hit_count - a.hit_count;
      return b.updated_at.localeCompare(a.updated_at);
    })
    .slice(0, limit);
}

export function fileCountMemories(userId: string): number {
  return readPayload().memories.filter((m) => visibleToUser(m, userId)).length;
}

export function fileUpsertMemory(input: {
  userId: string;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  content: string;
  source: MemorySource;
  sourceThreadId?: string | null;
}): { ok: true; memory: AgentMemory; created: boolean } {
  const payload = readPayload();
  const key = normalizeMemoryKey(input.key, input.content);
  const content = normalizeMemoryContent(input.content);
  const kind = normalizeMemoryKind(input.kind);
  const scope = normalizeMemoryScope(input.scope, kind);
  const now = new Date().toISOString();

  const existing =
    payload.memories.find((m) =>
      scope === 'install' ? m.scope === 'install' && m.key === key : m.scope === 'user' && m.user_id === input.userId && m.key === key,
    ) ??
    payload.memories.find(
      (m) => m.scope === scope && visibleToUser(m, input.userId) && memoriesAreSimilar(m.content, content),
    );

  if (existing) {
    existing.content = content;
    existing.kind = kind;
    existing.source = input.source;
    if (input.sourceThreadId) existing.source_thread_id = input.sourceThreadId;
    existing.hit_count += 1;
    existing.updated_at = now;
    writePayload(payload);
    return { ok: true, memory: existing, created: false };
  }

  const memory: AgentMemory = {
    id: payload.nextId++,
    user_id: input.userId,
    scope,
    kind,
    key,
    content,
    source: input.source,
    source_thread_id: input.sourceThreadId ?? null,
    hit_count: 1,
    created_at: now,
    updated_at: now,
    last_used_at: null,
  };
  payload.memories.push(memory);
  writePayload(payload);
  return { ok: true, memory, created: true };
}

export function fileDeleteMemory(opts: {
  userId: string;
  id?: number;
  key?: string;
}): { ok: true; deleted: number } | { ok: false; error: string } {
  const payload = readPayload();
  const before = payload.memories.length;
  payload.memories = payload.memories.filter((m) => {
    if (!visibleToUser(m, opts.userId)) return true;
    if (opts.id && m.id === opts.id) return false;
    if (opts.key && m.key === opts.key) return false;
    return true;
  });
  if (!opts.id && !opts.key?.trim()) return { ok: false, error: 'id or key is required' };
  writePayload(payload);
  return { ok: true, deleted: before - payload.memories.length };
}

export function fileTouchMemories(ids: number[]): void {
  if (!ids.length) return;
  const payload = readPayload();
  const now = new Date().toISOString();
  let changed = false;
  for (const memory of payload.memories) {
    if (!ids.includes(memory.id)) continue;
    memory.last_used_at = now;
    changed = true;
  }
  if (changed) writePayload(payload);
}
