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
import type { TelegramChatTurn } from './telegramChatHistory';
import type { ChatMessage, ChatThreadDetail, ChatThreadSummary } from './chatTypes';
import { titleFromMessage } from './chatTypes';

export { titleFromMessage };

const META_RE = /^<!--\s*(id|user|created|updated):\s*(.+?)\s*-->$/;
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
  meta: { id: string; user: string; created: string; updated: string };
  title: string;
  messages: ChatMessage[];
}

function parseThreadFile(content: string): ParsedThread | null {
  const lines = content.split('\n');
  let title = 'New chat';
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
    const text = body.join('\n').trimEnd();
    messages.push({
      id: `${meta.id}-${messages.length}`,
      role,
      content: text,
      created_at: meta.updated,
    });
  }

  return {
    meta: {
      id: meta.id,
      user: meta.user,
      created: meta.created,
      updated: meta.updated,
    },
    title,
    messages,
  };
}

function serializeThread(
  meta: ParsedThread['meta'],
  title: string,
  messages: ChatMessage[]
): string {
  const out = [
    `# ${title}`,
    `<!-- id: ${meta.id} -->`,
    `<!-- user: ${meta.user} -->`,
    `<!-- created: ${meta.created} -->`,
    `<!-- updated: ${meta.updated} -->`,
    '',
  ];
  for (const m of messages) {
    out.push(`## ${m.role}`, m.content, '');
  }
  return out.join('\n').trimEnd() + '\n';
}

export function fileListChatThreads(userId: string): ChatThreadSummary[] {
  const dir = chatsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const threads: ChatThreadSummary[] = [];

  for (const file of files) {
    try {
      const parsed = parseThreadFile(readFileSync(join(dir, file), 'utf8'));
      if (!parsed || parsed.meta.user !== userId) continue;
      threads.push({
        id: parsed.meta.id,
        title: parsed.title,
        created_at: parsed.meta.created,
        updated_at: parsed.meta.updated,
      });
    } catch (e) {
      console.error('[chats:file] parse error:', file, e);
    }
  }

  return threads.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function fileCreateChatThread(userId: string): ChatThreadSummary {
  const id = randomUUID();
  const now = new Date().toISOString();
  const meta = { id, user: userId, created: now, updated: now };
  writeFileSync(threadPath(id), serializeThread(meta, 'New chat', []), 'utf8');
  return { id, title: 'New chat', created_at: now, updated_at: now };
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
    messages: parsed.messages,
  };
}

export function fileAppendChatMessages(
  userId: string,
  threadId: string,
  turns: TelegramChatTurn[]
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
  };
  writeFileSync(threadPath(threadId), serializeThread(meta, thread.title, nextMessages), 'utf8');
  return true;
}

export function fileUpdateChatTitle(userId: string, threadId: string, title: string): boolean {
  const thread = fileGetChatThread(userId, threadId);
  if (!thread) return false;
  const meta = {
    id: threadId,
    user: userId,
    created: thread.created_at,
    updated: new Date().toISOString(),
  };
  writeFileSync(threadPath(threadId), serializeThread(meta, title, thread.messages), 'utf8');
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
