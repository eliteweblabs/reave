/**
 * POST /api/chats/:id/reconcile — close out a turn that died with no reply.
 *
 * The in-flight run registry and progress store live in process memory, so a
 * container restart or crash mid-run (a Railway deploy landing while an audit is
 * running, say) leaves the thread with the user's question saved and no answer
 * after it, and nothing left alive to write one. The chat would sit there
 * looking permanently unanswered.
 *
 * The client calls this when it observes that combination — no active run, no
 * progress, trailing user message — and we append an honest note so the thread
 * always ends with an assistant turn the user (and the model, next turn) can see.
 */
import type { APIContext } from 'astro';
import { getAgentProgress } from '../../../../lib/agentProgress';
import { isAgentRunActive } from '../../../../lib/agentRunControl';
import { storeAppendChatMessages, storeGetChatThread } from '../../../../lib/chatStore';

export const prerender = false;

const INTERRUPTED_NOTE =
  '_(This response was interrupted before it finished — the run ended without saving a reply ' +
  '(often a deploy restart or dropped connection, not necessarily something you did). ' +
  'Send the message again and I\'ll redo the work.)_';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  // A live run will write its own reply (the chat endpoint guarantees it), so
  // never insert a note underneath one that is still working.
  if (isAgentRunActive(userId, id) || getAgentProgress(userId, id)) {
    return json({ ok: true, reconciled: false, reason: 'run_active' });
  }

  const thread = await storeGetChatThread(userId, id);
  if (!thread) return json({ ok: false, error: 'Chat not found' }, 404);

  const last = thread.messages[thread.messages.length - 1];
  if (!last || last.role !== 'user') {
    return json({ ok: true, reconciled: false, reason: 'already_answered' });
  }

  const saved = await storeAppendChatMessages(userId, id, [
    { role: 'assistant', content: INTERRUPTED_NOTE },
  ]);
  if (!saved) return json({ ok: false, error: 'Failed to save note' }, 500);

  return json({
    ok: true,
    reconciled: true,
    assistantMessage: { role: 'assistant', content: INTERRUPTED_NOTE },
  });
}
