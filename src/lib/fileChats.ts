/**
 * Markdown-file chat archive (same persistence model as /api/todo).
 * One thread = one .md file under src/knowledge/chats/ (override with CHATS_DIR).
 *
 * On Railway, writes persist until the next deploy unless committed to git.
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import type { ChatTurn } from './chatTypes';
import type { ChatMessage, ChatThreadDetail, ChatThreadSummary } from './chatTypes';
import { titleFromMessage } from './chatTypes';

export { titleFromMessage };

const META_RE = /^<!--\s*(id|user|created|updated|archived|last_seen):\s*(.+?)\s*-->$/;
const MSG_USAGE_RE = /^<!--\s*agent_usage:\s*(.+?)\s*-->$/;
const MSG_HEADING_RE = /^##\s+(user|assistant)\s*$/i;

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function chatsDir(): string {
  const dir = process.env.CHATS_DIR?.trim() || join(projectRoot(), 'src', 'knowledge', 'chats');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function threadPath(id: string): string {
  return join(chatsDir(), `${id}.md`);
}

interface ParsedThread {
  meta: {
    id: string;
    user: string;
    created: string;
    updated: string;
    archived?: boolean;
    last_seen?: string | null;
  };
  title: string;
  messages: ChatMessage[];
}

function parseThreadFile(content: string): ParsedThread | null {
  const lines = content.split('\n');
  let title = 'New session';
  const meta: Record<string, string> = {};
  const messages: ChatMessage[] = [];
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      title = line.slice(2).trim() || title;
      continue;
    }
    const metaMatch = line.match(META_RE);
    if (metaMatch) {
      meta[metaMatch[1]] = metaMatch[2];
      continue;
    }
    if (line.trim() === '') continue;
    break;
  }

  if (!meta.id || !meta.user || !meta.created || !meta.updated) return null;

  for (; i < lines.length; i++) {
    const head = lines[i].match(MSG_HEADING_RE);
    if (!head) continue;
    const role = head[1].toLowerCase() as 'user' | 'assistant';
    const body: string[] = [];
    i++;
    for (; i < lines.length; i++) {
      if (MSG_HEADING_RE.test(lines[i])) {
        i--;
        break;
      }
      body.push(lines[i]);
    }
    let agent_usage: ChatMessage['agent_usage'];
    if (body.length && MSG_USAGE_RE.test(body[0].trim())) {
      const usageMatch = body[0].trim().match(MSG_USAGE_RE);
      if (usageMatch) {
        try {
          agent_usage = JSON.parse(usageMatch[1]) as ChatMessage['agent_usage'];
        } catch {
          agent_usage = undefined;
        }
      }
      body.shift();
    }
    const text = body.join('\n').trimEnd();
    messages.push({
      id: `${meta.id}-${messages.length}`,
      role,
      content: text,
      created_at: meta.updated,
      ...(agent_usage ? { agent_usage } : {}),
    });
  }

  return {
    meta: {
      id: meta.id,
      user: meta.user,
      created: meta.created,
      updated: meta.updated,
      archived: meta.archived === 'true',
      last_seen: meta.last_seen ?? null,
    },
    title,
    messages,
  };
}

function serializeThread(
  meta: ParsedThread['meta'],
  title: string,
  messages: ChatMessage[],
): string {
  const out = [
    `# ${title}`,
    `<!-- id: ${meta.id} -->`,
    `<!-- user: ${meta.user} -->`,
    `<!-- created: ${meta.created} -->`,
    `<!-- updated: ${meta.updated} -->`,
  ];
  if (meta.archived) out.push(`<!-- archived: true -->`);
  if (meta.last_seen) out.push(`<!-- last_seen: ${meta.last_seen} -->`);
  out.push('');
  for (const m of messages) {
    out.push(`## ${m.role}`);
    if (m.agent_usage) {
      out.push(`<!-- agent_usage: ${JSON.stringify(m.agent_usage)} -->`);
    }
    out.push(m.content, '');
  }
  return out.join('\n').trimEnd() + '\n';
}

export function fileListChatThreads(
  userId: string,
  opts?: { archivedOnly?: boolean },
): ChatThreadSummary[] {
  const dir = chatsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const threads: ChatThreadSummary[] = [];

  for (const file of files) {
    try {
      const parsed = parseThreadFile(readFileSync(join(dir, file), 'utf8'));
      if (!parsed || parsed.meta.user !== userId) continue;
      const isArchived = !!parsed.meta.archived;
      if (opts?.archivedOnly ? !isArchived : isArchived) continue;
      threads.push({
        id: parsed.meta.id,
        title: parsed.title,
        created_at: parsed.meta.created,
        updated_at: parsed.meta.updated,
        archived: !!parsed.meta.archived,
        last_role: parsed.messages.length
          ? parsed.messages[parsed.messages.length - 1].role
          : null,
        last_seen_at: parsed.meta.last_seen ?? null,
      });
    } catch (e) {
      console.error('[chats:file] parse error:', file, e);
    }
  }

  return threads.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export function fileCreateChatThread(userId: string): ChatThreadSummary {
  const id = randomUUID();
  const now = new Date().toISOString();
  const meta = { id, user: userId, created: now, updated: now };
  writeFileSync(threadPath(id), serializeThread(meta, 'New session', []), 'utf8');
  return { id, title: 'New session', created_at: now, updated_at: now, archived: false };
}

export function fileGetChatThreadOwnerUserId(threadId: string): string | null {
  const path = threadPath(threadId);
  if (!existsSync(path)) return null;
  const parsed = parseThreadFile(readFileSync(path, 'utf8'));
  return parsed?.meta.user?.trim() || null;
}

/** Move every thread file not owned by `toUserId` onto that user (Clerk id recovery). */
export function fileConsolidateOrphanedChatThreads(toUserId: string): number {
  const to = toUserId.trim();
  if (!to) return 0;
  const dir = chatsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  let moved = 0;
  for (const file of files) {
    const path = join(dir, file);
    try {
      const parsed = parseThreadFile(readFileSync(path, 'utf8'));
      if (!parsed || parsed.meta.user === to) continue;
      const meta = { ...parsed.meta, user: to };
      writeFileSync(path, serializeThread(meta, parsed.title, parsed.messages), 'utf8');
      moved += 1;
    } catch (e) {
      console.error('[chats:file] consolidate error:', file, e);
    }
  }
  return moved;
}

export function fileGetChatSummaryById(
  threadId: string,
): { id: string; title: string; updatedAt: string } | null {
  const path = threadPath(threadId);
  if (!existsSync(path)) return null;
  const parsed = parseThreadFile(readFileSync(path, 'utf8'));
  if (!parsed) return null;
  return {
    id: parsed.meta.id,
    title: parsed.title,
    updatedAt: parsed.meta.updated,
  };
}

export function fileGetChatThread(userId: string, threadId: string): ChatThreadDetail | null {
  const path = threadPath(threadId);
  if (!existsSync(path)) return null;
  const parsed = parseThreadFile(readFileSync(path, 'utf8'));
  if (!parsed || parsed.meta.user !== userId) return null;
  return {
    id: parsed.meta.id,
    title: parsed.title,
    created_at: parsed.meta.created,
    updated_at: parsed.meta.updated,
    archived: !!parsed.meta.archived,
    last_seen_at: parsed.meta.last_seen ?? null,
    messages: parsed.messages,
  };
}

export function fileAppendChatMessages(
  userId: string,
  threadId: string,
  turns: ChatTurn[]
): boolean {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread || !turns.length) return false;

  const now = new Date().toISOString();
  const nextMessages = [...thread.messages];
  for (const t of turns) {
    nextMessages.push({
      id: `${threadId}-${nextMessages.length}`,
      role: t.role,
      content: t.content,
      created_at: now,
    });
  }

  const meta = {
    id: threadId,
    user: userId,
    created: thread.created_at,
    updated: now,
    archived: thread.archived,
    last_seen: thread.last_seen_at ?? null,
  };
  writeFileSync(threadPath(threadId), serializeThread(meta, thread.title, nextMessages), 'utf8');
  return true;
}

function threadMetaFromDetail(thread: ChatThreadDetail, userId: string, updated: string) {
  return {
    id: thread.id,
    user: userId,
    created: thread.created_at,
    updated,
    archived: thread.archived,
    last_seen: thread.last_seen_at ?? null,
  };
}

export function fileUpdateChatTitle(userId: string, threadId: string, title: string): boolean {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread) return false;
  const meta = threadMetaFromDetail(thread, userId, new Date().toISOString());
  writeFileSync(threadPath(threadId), serializeThread(meta, title, thread.messages), 'utf8');
  return true;
}

/** File-backend counterpart to `pgMarkChatSeen` — see its doc comment. */
export function fileMarkChatSeen(
  userId: string,
  threadId: string,
  seenAt?: string,
): string | null {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread) return null;
  const at = seenAt && !Number.isNaN(Date.parse(seenAt)) ? seenAt : new Date().toISOString();
  const prev = thread.last_seen_at ? Date.parse(thread.last_seen_at) : NaN;
  const next = Number.isFinite(prev) && prev > Date.parse(at) ? thread.last_seen_at! : at;
  const meta = threadMetaFromDetail(thread, userId, thread.updated_at);
  meta.last_seen = next;
  writeFileSync(threadPath(threadId), serializeThread(meta, thread.title, thread.messages), 'utf8');
  return next;
}

export function fileSetChatArchived(userId: string, threadId: string, archived: boolean): boolean {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread) return false;
  const meta = threadMetaFromDetail(thread, userId, new Date().toISOString());
  meta.archived = archived;
  writeFileSync(threadPath(threadId), serializeThread(meta, thread.title, thread.messages), 'utf8');
  return true;
}

export function fileDeleteChatThread(userId: string, threadId: string): boolean {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread) return false;
  const path = threadPath(threadId);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
