/**
 * POST /api/chats/:id/reconcile — close out a turn that died with no reply.
 *
 * The in-flight run registry and progress store live in process memory, so a
 * container restart or crash mid-run (a Railway deploy landing while an audit is
 * running, say) leaves the thread with the user's question saved and no answer
 * after it, and nothing left alive to write one. The chat would sit there
 * looking permanently unanswered.
 *
 * Durable agent_run_leases (heartbeated while a turn runs) let a new replica
 * see that the draining process is still working — we must not insert the
 * interrupted note underneath a lease that is still alive.
 *
 * The client calls this when it observes that combination — no active run, no
 * progress, trailing user message — and we append an honest note so the thread
 * always ends with an assistant turn the user (and the model, next turn) can see.
 */
import type { APIContext } from 'astro';
import { getAgentProgress } from '../../../../lib/agentProgress';
import { isAgentRunActive } from '../../../../lib/agentRunControl';
import { resolveChatThreadOwnerUserId } from '../../../../lib/chatOwnerAccess';
import { storeAppendChatMessages, storeGetChatThread } from '../../../../lib/chatStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { getAliveAgentRunLease } from '../../../../lib/pgAgentRunLeases';
import '../../../../lib/processDrain';
import { json } from '../../../../lib/apiJson';

export const prerender = false;

const INTERRUPTED_NOTE =
  '_(This response was interrupted before it finished — the run ended without saving a reply ' +
  '(often a deploy restart or dropped connection, not necessarily something you did). ' +
  'Send the message again and I\'ll redo the work.)_';

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  // A live run will write its own reply (the chat endpoint guarantees it), so
  // never insert a note underneath one that is still working — locally or on a
  // draining replica that still holds a fresh lease.
  if (isAgentRunActive(userId, id) || getAgentProgress(userId, id)) {
    return json({ ok: true, reconciled: false, reason: 'run_active' });
  }
  if (await getAliveAgentRunLease(userId, id)) {
    return json({ ok: true, reconciled: false, reason: 'run_lease_active' });
  }

  const ownerUserId = await resolveChatThreadOwnerUserId(userId, id);
  if (!ownerUserId) return json({ ok: false, error: 'Session not found' }, 404);

  const thread = await storeGetChatThread(ownerUserId, id);
  if (!thread) return json({ ok: false, error: 'Session not found' }, 404);

  const last = thread.messages[thread.messages.length - 1];
  if (!last || last.role !== 'user') {
    return json({ ok: true, reconciled: false, reason: 'already_answered' });
  }

  const saved = await storeAppendChatMessages(ownerUserId, id, [
    { role: 'assistant', content: INTERRUPTED_NOTE },
  ]);
  if (!saved) return json({ ok: false, error: 'Failed to save note' }, 500);

  return json({
    ok: true,
    reconciled: true,
    assistantMessage: { role: 'assistant', content: INTERRUPTED_NOTE },
  });
}
