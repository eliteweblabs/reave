/**
 * GET    /api/chats/:id — thread + messages
 * POST   /api/chats/:id — send a message { message } → runs Claude agent, persists reply
 * PATCH  /api/chats/:id — rename thread { title } or archive { archived: boolean }
 * DELETE /api/chats/:id — delete thread and all messages
 */

import type { APIContext } from 'astro';
import type { ChatImageAttachment, ChatImageMediaType } from '../../../lib/chatTypes';
import {
  serializeChatMessageContent,
  titleFromMessage,
} from '../../../lib/chatTypes';
import {
  storeAppendChatMessages,
  storeDeleteChatThread,
  storeGetChatThread,
  storeSetChatArchived,
  storeUpdateChatTitle,
} from '../../../lib/chatStore';
import { runKnowledgeAgent } from '../../../lib/agentRunner';
import { clearAgentProgress, setAgentProgress } from '../../../lib/agentProgress';
import type { ChatTurn } from '../../../lib/chatTypes';
import { listJobsForItem } from '../../../lib/projectLinks';
import { promoteChatImagesToLinkedProjects } from '../../../lib/projectFiles';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function historyCap(): number | null {
  const raw = import.meta.env.AGENT_CHAT_HISTORY_TURNS;
  if (!raw?.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const ALLOWED_IMAGE_MEDIA = new Set<ChatImageMediaType>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const MAX_CHAT_IMAGES = 5;
const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

function parseChatImages(body: Record<string, unknown>): ChatImageAttachment[] {
  const raw = body.images;
  if (!Array.isArray(raw)) return [];
  const out: ChatImageAttachment[] = [];
  for (const item of raw.slice(0, MAX_CHAT_IMAGES)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const mediaType = String(rec.mediaType ?? rec.media_type ?? '').toLowerCase();
    const data = String(rec.data ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!ALLOWED_IMAGE_MEDIA.has(mediaType as ChatImageMediaType) || !data) continue;
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes < 1 || bytes > MAX_CHAT_IMAGE_BYTES) continue;
    out.push({ mediaType: mediaType as ChatImageMediaType, data });
  }
  return out;
}

function priorTurns(messages: { role: string; content: string }[]): ChatTurn[] {
  const turns = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  const cap = historyCap();
  if (cap == null) return turns;
  return turns.length <= cap ? turns : turns.slice(-cap);
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);
  const linked_jobs = await listJobsForItem('chat', id);
  return json({ ok: true, thread: { ...thread, linked_jobs } });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const message = String(body.message ?? '').trim();
  const images = parseChatImages(body);
  if (!message && !images.length) {
    return json({ ok: false, error: 'message or images required' }, 400);
  }
  const modelOverride =
    body.model == null || body.model === '' ? undefined : String(body.model);

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);

  const isFirstMessage = thread.messages.length === 0;
  const userContent = serializeChatMessageContent(message, images);
  const linked_jobs = await listJobsForItem('chat', id);
  let promoted_files: Record<string, { id: string; filename: string; url: string }[]> = {};
  if (images.length && linked_jobs.length) {
    const promoted = await promoteChatImagesToLinkedProjects(
      id,
      images,
      linked_jobs.map((j) => j.slug),
      userId,
    );
    for (const [slug, files] of Object.entries(promoted)) {
      promoted_files[slug] = files.map((f) => ({
        id: f.id,
        filename: f.filename,
        url: f.url,
      }));
    }
  }

  clearAgentProgress(userId, id);
  setAgentProgress(userId, id, { phase: 'thinking', round: 0 });

  let reply: string;
  try {
    reply = await runKnowledgeAgent({
      userText: message,
      images,
      priorTurns: priorTurns(thread.messages),
      model: modelOverride,
      context: {
        userId,
        threadId: id,
        emailId: thread.source_email_id ?? undefined,
        messageImages: images.length ? images : undefined,
      },
    });
  } finally {
    clearAgentProgress(userId, id);
  }

  const saved = await storeAppendChatMessages(userId, id, [
    { role: 'user', content: userContent },
    { role: 'assistant', content: reply },
  ]);
  if (!saved) return json({ ok: false, error: 'Failed to save messages' }, 500);

  let title = thread.title;
  if (isFirstMessage || title === 'New chat') {
    title = titleFromMessage(message, images.length);
    await storeUpdateChatTitle(userId, id, title);
  }

  return json({
    ok: true,
    title,
    userMessage: { role: 'user', content: userContent },
    assistantMessage: { role: 'assistant', content: reply },
    promoted_files: Object.keys(promoted_files).length ? promoted_files : undefined,
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const title = body.title == null ? '' : String(body.title).trim();
  const hasArchived = typeof body.archived === 'boolean';

  if (!title && !hasArchived) {
    return json({ ok: false, error: 'title or archived is required' }, 400);
  }

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);

  if (hasArchived) {
    const updated = await storeSetChatArchived(userId, id, body.archived as boolean);
    if (!updated) return json({ ok: false, error: 'Failed to update chat' }, 500);
    return json({ ok: true, id, archived: body.archived });
  }

  if (!title) return json({ ok: false, error: 'title is required' }, 400);

  const updated = await storeUpdateChatTitle(userId, id, title);
  if (!updated) return json({ ok: false, error: 'Failed to update title' }, 500);

  return json({ ok: true, id, title });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const deleted = await storeDeleteChatThread(userId, id);
  if (!deleted) return json({ ok: false, error: 'Chat not found' }, 404);
  return json({ ok: true, id });
}
