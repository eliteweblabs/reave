/**
 * Durable recall — kinds, keys, secret filters, and prompt formatting.
 * Pure helpers (no I/O) so extract + store + verify scripts share one definition.
 */

export const MEMORY_KINDS = [
  'preference',
  'procedure',
  'fact',
  'decision',
  'client',
  'habit',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_SCOPES = ['user', 'install'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_SOURCES = ['agent', 'extract', 'owner'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export interface AgentMemory {
  id: number;
  user_id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  content: string;
  source: MemorySource;
  source_thread_id: string | null;
  hit_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export type AgentMemoryDraft = {
  kind: MemoryKind;
  key: string;
  content: string;
  scope: MemoryScope;
};

const SECRET_RE =
  /password|passwd|api[_-]?key|secret\b|token\b|bearer\s|authorization:|sk-[a-z0-9]|whsec_|-----BEGIN|private[_-]?key/i;

const HAND_OFF_STUB_RE = /please wait for instructions/i;

export const MAX_MEMORY_CONTENT = 400;
export const MAX_INJECTED_MEMORIES = 40;
export const MAX_EXTRACTED_MEMORIES = 5;

export function isMemoryKind(raw: unknown): raw is MemoryKind {
  return MEMORY_KINDS.includes(String(raw ?? '').trim().toLowerCase() as MemoryKind);
}

export function isMemoryScope(raw: unknown): raw is MemoryScope {
  return MEMORY_SCOPES.includes(String(raw ?? '').trim().toLowerCase() as MemoryScope);
}

export function normalizeMemoryKind(raw: unknown, fallback: MemoryKind = 'fact'): MemoryKind {
  const v = String(raw ?? '').trim().toLowerCase();
  return isMemoryKind(v) ? v : fallback;
}

export function normalizeMemoryScope(
  raw: unknown,
  kind: MemoryKind = 'fact',
): MemoryScope {
  if (isMemoryScope(raw)) return raw;
  return kind === 'fact' ? 'user' : 'install';
}

/** Stable slug for upsert / dedup. */
export function normalizeMemoryKey(raw: unknown, fallbackContent = ''): string {
  const fromRaw = slugPart(String(raw ?? ''));
  if (fromRaw) return fromRaw.slice(0, 80);
  const fromContent = slugPart(fallbackContent).slice(0, 80);
  return fromContent || 'item';
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
}

export function looksLikeSecret(text: string): boolean {
  return SECRET_RE.test(text);
}

export function isHandoffStub(text: string): boolean {
  return HAND_OFF_STUB_RE.test(text);
}

export function normalizeMemoryContent(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MEMORY_CONTENT);
}

export function isUsableMemoryContent(content: string): boolean {
  if (content.length < 8 || content.length > MAX_MEMORY_CONTENT) return false;
  if (looksLikeSecret(content)) return false;
  return true;
}

/** Collapse punctuation so "I'm 25." matches "i am 25". */
export function memoryContentFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memoriesAreSimilar(a: string, b: string): boolean {
  const left = memoryContentFingerprint(a);
  const right = memoryContentFingerprint(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 16 && right.length >= 16 && (left.includes(right) || right.includes(left))) {
    return true;
  }
  const leftHead = left.slice(0, 48);
  const rightHead = right.slice(0, 48);
  return leftHead.length >= 24 && leftHead === rightHead;
}

export function inferMemoryScope(kind: MemoryKind, content: string): MemoryScope {
  if (kind !== 'fact') return 'install';
  const personal = /\b(i am|i'm|i have|i've|my (kids?|children|age|wife|husband|son|daughter|dog|birthday))\b/i;
  return personal.test(content) ? 'user' : 'install';
}

export type ExtractedMemoryJson = {
  kind?: unknown;
  key?: unknown;
  content?: unknown;
  scope?: unknown;
};

/** Parse a Haiku extract payload — object `{ memories }` or a bare array. */
export function parseExtractedMemories(raw: string): AgentMemoryDraft[] {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('{') >= 0 && (text.indexOf('[') < 0 || text.indexOf('{') < text.indexOf('['))
      ? text.indexOf('{')
      : text.indexOf('[');
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  const rows: ExtractedMemoryJson[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { memories?: unknown }).memories)
      ? ((parsed as { memories: ExtractedMemoryJson[] }).memories)
      : [];

  const out: AgentMemoryDraft[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (out.length >= MAX_EXTRACTED_MEMORIES) break;
    if (!row || typeof row !== 'object') continue;
    const content = normalizeMemoryContent(row.content);
    if (!isUsableMemoryContent(content)) continue;
    const kind = normalizeMemoryKind(row.kind);
    const key = normalizeMemoryKey(row.key, `${kind}.${content}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const scope = isMemoryScope(row.scope) ? row.scope : inferMemoryScope(kind, content);
    out.push({ kind, key, content, scope });
  }
  return out;
}

export function formatMemoriesForPrompt(memories: AgentMemory[], totalCount = memories.length): string | null {
  if (!memories.length) return null;
  const lines = memories.slice(0, MAX_INJECTED_MEMORIES).map((m) => `- [${m.kind}] ${m.content}`);
  const extra = totalCount > memories.length ? totalCount - memories.length : 0;
  const header =
    'Durable recall (already known from earlier chats — use these; do not re-ask):';
  const footer = extra
    ? `(${extra} more on file — call search_memories if you need something that is not listed.)`
    : '';
  return [header, ...lines, footer].filter(Boolean).join('\n');
}

export type MemoryUpdateNotifyInput = {
  id?: number;
  content: string;
};

/** Phone push copy when durable recall is created or rewritten (no dashboard card). */
export function formatMemoryUpdateNotification(opts: {
  memories: MemoryUpdateNotifyInput[];
  created?: boolean;
  threadId?: string | null;
}): { title: string; body: string; tag: string; url: string } {
  const items = opts.memories
    .map((m) => ({
      id: typeof m.id === 'number' && Number.isFinite(m.id) ? m.id : undefined,
      content: normalizeMemoryContent(m.content),
    }))
    .filter((m) => m.content);
  const n = items.length;
  const created = opts.created !== false;
  const title =
    n > 1
      ? created
        ? `🧠 ${n} memories saved`
        : `🧠 ${n} memories updated`
      : created
        ? '🧠 Memory saved'
        : '🧠 Memory updated';
  const body =
    items.map((m) => m.content).join(' · ') || 'Agent durable recall was updated.';
  const ids = items.map((m) => m.id).filter((id): id is number => id != null);
  const tag =
    n === 1 && ids[0] != null
      ? `memory-${ids[0]}`
      : `memory-batch-${ids.join('-') || 'new'}`;
  const threadId = opts.threadId?.trim();
  return {
    title,
    body,
    tag,
    url: threadId
      ? `/admin?tab=chats&chat=${encodeURIComponent(threadId)}`
      : '/admin?tab=chats',
  };
}

export function shouldSkipMemoryExtract(opts: {
  userText: string;
  assistantText: string;
  systemAlert?: boolean;
}): boolean {
  if (opts.systemAlert) return true;
  if (isHandoffStub(opts.userText)) return true;
  const user = opts.userText.trim();
  const assistant = opts.assistantText.trim();
  if (!user || !assistant) return true;
  if (looksLikeSecret(user) && user.length < 200) return true;
  if (assistant.startsWith('_(')) return true;
  if (user.length < 12 && assistant.length < 80) return true;
  return false;
}
