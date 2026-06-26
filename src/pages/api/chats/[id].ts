/**
 * GET  /api/chats/:id — thread + messages
 * POST /api/chats/:id — send a message { message } → runs Claude agent, persists reply
 */

import type { APIContext } from 'astro';
import {
  storeAppendChatMessages,
  storeGetChatThread,
  storeUpdateChatTitle,
  titleFromMessage,
} from '../../../lib/chatStore';
import { runTelegramKnowledgeAgent } from '../../../lib/telegramAgent';
import type { TelegramChatTurn } from '../../../lib/telegramChatHistory';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function historyCap(): number {
  const raw = import.meta.env.TELEGRAM_CHAT_HISTORY_TURNS;
  if (!raw?.trim()) return 20;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function priorTurns(messages: { role: string; content: string }[]): TelegramChatTurn[] {
  const turns = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  const cap = historyCap();
  return turns.length <= cap ? turns : turns.slice(-cap);
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);
  return json({ ok: true, thread });
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
  if (!message) return json({ ok: false, error: 'message is required' }, 400);
  const modelOverride =
    body.model == null || body.model === '' ? undefined : String(body.model);

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);

  const isFirstMessage = thread.messages.length === 0;
  const reply = await runTelegramKnowledgeAgent({
    userText: message,
    priorTurns: priorTurns(thread.messages),
    model: modelOverride,
  });

  const saved = await storeAppendChatMessages(userId, id, [
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ]);
  if (!saved) return json({ ok: false, error: 'Failed to save messages' }, 500);

  let title = thread.title;
  if (isFirstMessage || title === 'New chat') {
    title = titleFromMessage(message);
    await storeUpdateChatTitle(userId, id, title);
  }

  return json({
    ok: true,
    title,
    userMessage: { role: 'user', content: message },
    assistantMessage: { role: 'assistant', content: reply },
  });
}
