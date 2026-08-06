/**
 * GET    /api/chats/:id — thread + messages
 * POST   /api/chats/:id — send a message { message } → runs Claude agent, persists reply
 * PATCH  /api/chats/:id — rename { title }, archive { archived }, link project { linkJobSlug }, finalize title { finalizeTitle }
 * DELETE /api/chats/:id — delete thread and all messages
 */

import type { APIContext } from 'astro';
import type {
  ChatDocAttachment,
  ChatDocMediaType,
  ChatImageAttachment,
  ChatImageMediaType,
} from '../../../lib/chatTypes';
import {
  isDefaultChatTitle,
  serializeChatMessageContent,
  titleFromMessage,
} from '../../../lib/chatTypes';
import {
  resolveChatThreadOwnerUserId,
  storeGetChatThreadForOwner,
} from '../../../lib/chatOwnerAccess';
import {
  storeAppendChatMessages,
  storeDeleteChatThread,
  storeEnsureChatTitle,
  storeGetChatThread,
  storeSetChatArchived,
  storeUpdateChatTitle,
} from '../../../lib/chatStore';
import { runKnowledgeAgent, runKnowledgeAgentStreaming } from '../../../lib/agentRunner';
import { clearAgentProgress, setAgentProgress } from '../../../lib/agentProgress';
import {
  cancelAgentRun,
  clearAgentRun,
  registerAgentRun,
} from '../../../lib/agentRunControl';
import {
  createAgentDeadline,
  formatSeconds,
  isAgentTimeoutError,
  withDeadline,
} from '../../../lib/agentWatchdog';
import { getAgentProgress } from '../../../lib/agentProgress';
import { createChatAgentSseResponse } from '../../../lib/chatAgentSse';
import { pumpAgentStream } from '../../../lib/chatAgentPump';
import type { ChatTurn } from '../../../lib/chatTypes';
import { listJobsForItem, linkProjectItem } from '../../../lib/projectLinks';
import { enrichChatThreadsWithAuthors } from '../../../lib/chatThreadAuthors';
import { serverEnv } from '../../../lib/serverEnv';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  promoteChatDocsToLinkedProjects,
  promoteChatImagesToLinkedProjects,
} from '../../../lib/projectFiles';
import {
  chatDeployLockMessage,
  getDeployStatus,
  isChatLockedForDeploy,
} from '../../../lib/deployStatus';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// serverEnv, not import.meta.env — the latter is inlined at build time and so is
// always empty for values set on the Railway service.
function historyCap(): number | null {
  const raw = serverEnv('AGENT_CHAT_HISTORY_TURNS');
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
  'image/svg+xml',
]);
const MAX_CHAT_IMAGES = 5;
const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_DOC_MEDIA = new Set<ChatDocMediaType>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const MAX_CHAT_DOCS = 3;
const MAX_CHAT_DOC_BYTES = 10 * 1024 * 1024;

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

function parseChatDocs(body: Record<string, unknown>): ChatDocAttachment[] {
  const raw = body.docs;
  if (!Array.isArray(raw)) return [];
  const out: ChatDocAttachment[] = [];
  for (const item of raw.slice(0, MAX_CHAT_DOCS)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const mediaType = String(rec.mediaType ?? rec.media_type ?? '').toLowerCase();
    const data = String(rec.data ?? '').replace(/^data:[^;]+;base64,/, '');
    const filename = String(rec.filename ?? '').trim() || 'attachment';
    if (!ALLOWED_DOC_MEDIA.has(mediaType as ChatDocMediaType) || !data) continue;
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes < 1 || bytes > MAX_CHAT_DOC_BYTES) continue;
    out.push({ mediaType: mediaType as ChatDocMediaType, filename, data });
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

function wantsEventStream(context: APIContext, body: Record<string, unknown>): boolean {
  if (body.stream === true) return true;
  const accept = context.request.headers.get('Accept') ?? '';
  return accept.includes('text/event-stream');
}

/**
 * Persist the user's message immediately (before the agent runs) so that an
 * interrupted turn — tab close, navigation away from /admin, or a dropped
 * network connection — still leaves a durable record instead of vanishing.
 * The assistant reply is appended separately once the run completes.
 */
async function persistUserMessage(
  userId: string,
  id: string,
  thread: NonNullable<Awaited<ReturnType<typeof storeGetChatThread>>>,
  message: string,
  images: ChatImageAttachment[],
  docs: ChatDocAttachment[],
  userContent: string,
  isFirstMessage: boolean,
): Promise<{
  title: string;
  userMessage: { role: 'user'; content: string };
}> {
  const saved = await storeAppendChatMessages(userId, id, [
    { role: 'user', content: userContent },
  ]);
  if (!saved) throw new Error('Failed to save message');

  let title = thread.title;
  if (isFirstMessage || isDefaultChatTitle(title)) {
    title = titleFromMessage(message, images.length, docs.length);
    await storeUpdateChatTitle(userId, id, title);
  }

  return {
    title,
    userMessage: { role: 'user', content: userContent },
  };
}

/**
 * Text for a turn that never produced a normal reply — cancelled, timed out, or
 * failed mid-run. Whatever had already streamed (tracked via agentProgress) is
 * kept so the thread shows the work that did happen, and so the model has real
 * context next turn instead of drawing a blank on a task it started.
 */
function interruptedReplyText(
  userId: string,
  id: string,
  opts: { cancelled: boolean; errorMessage?: string },
): string {
  const partial = getAgentProgress(userId, id)?.partialText?.trim() ?? '';
  const note = opts.cancelled
    ? '_(This response was stopped before it finished.)_'
    : `_(This response did not finish — the run failed: ${opts.errorMessage || 'unknown error'}.)_`;
  return partial ? `${partial}\n\n${note}` : note;
}

/**
 * Persist an assistant message, retrying once. A transient database blip on the
 * write is the one remaining way a completed answer could still vanish, and the
 * reply is already fully computed by this point, so it is worth a second try.
 */
async function persistAssistantReply(
  userId: string,
  id: string,
  reply: string,
): Promise<{ ok: boolean; assistantMessage: { role: 'assistant'; content: string } }> {
  const assistantMessage = { role: 'assistant' as const, content: reply };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const saved = await storeAppendChatMessages(userId, id, [assistantMessage]);
      if (saved) return { ok: true, assistantMessage };
    } catch {
      /* fall through to retry */
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, assistantMessage };
}

async function loadOwnerChatThread(signedInUserId: string, threadId: string) {
  const ownerUserId = await resolveChatThreadOwnerUserId(signedInUserId, threadId);
  if (!ownerUserId) return null;
  const thread = await storeGetChatThread(ownerUserId, threadId);
  if (!thread) return null;
  return { ownerUserId, thread };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const thread = await storeGetChatThreadForOwner(userId, id);
  if (!thread) return json({ ok: false, error: 'Session not found' }, 404);
  const linked_jobs = await listJobsForItem('chat', id);
  const [withAuthor] = await enrichChatThreadsWithAuthors([{ ...thread, linked_jobs }]);
  return json({ ok: true, thread: withAuthor });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

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
  const docs = parseChatDocs(body);
  if (!message && !images.length && !docs.length) {
    return json({ ok: false, error: 'message, images, or docs required' }, 400);
  }
  const modelOverride =
    body.model == null || body.model === '' ? undefined : String(body.model);

  const loaded = await loadOwnerChatThread(userId, id);
  if (!loaded) return json({ ok: false, error: 'Session not found' }, 404);
  const { ownerUserId, thread } = loaded;

  const deployStatus = await getDeployStatus();
  if (isChatLockedForDeploy(deployStatus)) {
    return json(
      {
        ok: false,
        deploy_locked: true,
        deploy_state: deployStatus!.state,
        error: chatDeployLockMessage(deployStatus!),
      },
      503,
    );
  }

  const isFirstMessage = thread.messages.length === 0;
  const userContent = serializeChatMessageContent(message, images, docs);
  const linked_jobs = await listJobsForItem('chat', id);
  let promoted_files: Record<string, { id: string; filename: string; url: string }[]> = {};
  if ((images.length || docs.length) && linked_jobs.length) {
    const jobSlugs = linked_jobs.map((j) => j.slug);
    const [promotedImages, promotedDocs]: [
      Record<string, { id: string; filename: string; url: string }[]>,
      Record<string, { id: string; filename: string; url: string }[]>,
    ] = await Promise.all([
      images.length
        ? promoteChatImagesToLinkedProjects(id, images, jobSlugs, userId)
        : Promise.resolve({}),
      docs.length
        ? promoteChatDocsToLinkedProjects(id, docs, jobSlugs, userId)
        : Promise.resolve({}),
    ]);
    for (const slug of new Set([...Object.keys(promotedImages), ...Object.keys(promotedDocs)])) {
      const files = [...(promotedImages[slug] ?? []), ...(promotedDocs[slug] ?? [])];
      promoted_files[slug] = files.map((f) => ({
        id: f.id,
        filename: f.filename,
        url: f.url,
      }));
    }
  }

  // Save the user's message before running the agent so an interrupted turn
  // still leaves a record. `thread.messages` (the snapshot used for priorTurns)
  // is intentionally left untouched so the new message isn't double-counted.
  let title = thread.title;
  let userMessage = { role: 'user' as const, content: userContent };
  try {
    const persistedUser = await persistUserMessage(
      ownerUserId,
      id,
      thread,
      message,
      images,
      docs,
      userContent,
      isFirstMessage,
    );
    title = persistedUser.title;
    userMessage = persistedUser.userMessage;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save message';
    return json({ ok: false, error: msg }, 500);
  }

  clearAgentProgress(userId, id);
  setAgentProgress(userId, id, { phase: 'thinking', round: 0 });

  const agentContext = {
    userId,
    threadId: id,
    emailId: thread.source_email_id ?? undefined,
    messageImages: images.length ? images : undefined,
    messageDocs: docs.length ? docs : undefined,
  };

  if (wantsEventStream(context, body)) {
    // Deliberately NOT passing context.request.signal here: a dropped
    // connection (tab closed, navigation, phone locked mid-audit) must not
    // kill a long multi-tool-call run. The run keeps going server-side and
    // persists its result regardless of whether anyone is still listening.
    // The only way to actually stop it early is the explicit /cancel route.
    return createChatAgentSseResponse(async (emit) => {
      const runSignal = registerAgentRun(userId, id);
      const deadline = createAgentDeadline();
      // Outer ceiling: the agent enforces `deadline` itself and normally bails
      // out gracefully well inside it. This grace window only exists for the
      // pathological case where the run wedges somewhere the agent loop cannot
      // see (a hung DB call before the first round, say) — then we abandon it
      // rather than let the turn hang.
      const hardDeadlineAt = deadline.startedAt + deadline.totalMs + 45_000;

      // Every exit path funnels through here, so the turn always ends with a
      // persisted assistant message AND a single `done` event carrying it.
      let settled = false;
      const settle = async (reply: string, opts: { interrupted?: boolean } = {}) => {
        if (settled) return;
        settled = true;
        const text = reply.trim() || interruptedReplyText(userId, id, { cancelled: false });
        const persisted = await persistAssistantReply(ownerUserId, id, text);
        try {
          const ensuredTitle = await storeEnsureChatTitle(ownerUserId, id);
          if (ensuredTitle) title = ensuredTitle;
        } catch {
          /* title is cosmetic — never block the reply on it */
        }
        emit({
          type: 'done',
          ok: true,
          title,
          userMessage,
          assistantMessage: persisted.assistantMessage,
          ...(opts.interrupted ? { interrupted: true } : {}),
          ...(persisted.ok ? {} : { error: 'Reply could not be saved to this thread.' }),
        });
      };

      try {
        const outcome = await pumpAgentStream({
          stream: runKnowledgeAgentStreaming({
            userText: message,
            images,
            docs,
            priorTurns: priorTurns(thread.messages),
            model: modelOverride,
            context: agentContext,
            signal: runSignal,
            deadline,
          }),
          emit,
          hardDeadlineAt,
          isCancelled: () => runSignal.aborted,
        });

        if (outcome.status === 'complete') {
          await settle(outcome.reply);
        } else if (outcome.status === 'timeout') {
          // Stop the wedged work so it cannot keep burning resources or write to
          // this thread after we have already answered for it.
          cancelAgentRun(userId, id);
          await settle(
            interruptedReplyText(userId, id, {
              cancelled: false,
              errorMessage: `no response after ${formatSeconds(deadline.totalMs)}`,
            }),
            { interrupted: true },
          );
        } else if (outcome.status === 'cancelled') {
          await settle(interruptedReplyText(userId, id, { cancelled: true }), {
            interrupted: true,
          });
        } else {
          await settle(
            interruptedReplyText(userId, id, { cancelled: false, errorMessage: outcome.error }),
            { interrupted: true },
          );
        }
      } finally {
        // Last line of defence: if even `settle` threw, still close the turn so
        // the client is not left waiting on a stream that will never resolve.
        if (!settled) {
          settled = true;
          emit({
            type: 'done',
            ok: true,
            interrupted: true,
            title,
            userMessage,
            assistantMessage: {
              role: 'assistant',
              content: interruptedReplyText(userId, id, {
                cancelled: false,
                errorMessage: 'the reply could not be finalized',
              }),
            },
          });
        }
        clearAgentProgress(userId, id);
        clearAgentRun(userId, id);
      }
    });
  }

  // Same reasoning as the streaming branch above: do not tie this run to the
  // request's own connection lifetime, so it can finish and persist even if
  // the caller goes away before the response comes back.
  const runSignal = registerAgentRun(userId, id);
  const deadline = createAgentDeadline();
  let reply: string;
  let interrupted = false;
  try {
    reply = await withDeadline(
      runKnowledgeAgent({
        userText: message,
        images,
        docs,
        priorTurns: priorTurns(thread.messages),
        model: modelOverride,
        context: agentContext,
        signal: runSignal,
        deadline,
      }),
      deadline.totalMs + 45_000,
      'Agent run',
    );
  } catch (err) {
    // The turn still gets an answer: a notice plus whatever streamed before the
    // failure, saved to the thread the same way a normal reply would be.
    interrupted = true;
    if (isAgentTimeoutError(err)) cancelAgentRun(userId, id);
    const msg = isAgentTimeoutError(err)
      ? `no response after ${formatSeconds(deadline.totalMs)}`
      : err instanceof Error
        ? err.message
        : 'Agent run failed';
    reply = interruptedReplyText(userId, id, { cancelled: runSignal.aborted, errorMessage: msg });
  } finally {
    clearAgentProgress(userId, id);
    clearAgentRun(userId, id);
  }

  const persisted = await persistAssistantReply(ownerUserId, id, reply);
  try {
    const ensuredTitle = await storeEnsureChatTitle(ownerUserId, id);
    if (ensuredTitle) title = ensuredTitle;
  } catch {
    /* title is cosmetic */
  }

  return json({
    ok: true,
    title,
    userMessage,
    assistantMessage: persisted.assistantMessage,
    ...(interrupted ? { interrupted: true } : {}),
    ...(persisted.ok ? {} : { save_error: 'Reply could not be saved to this thread.' }),
    promoted_files: Object.keys(promoted_files).length ? promoted_files : undefined,
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

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
  const hasFinalizeTitle = body.finalizeTitle === true;
  const linkJobSlug = String(body.linkJobSlug ?? body.link_job_slug ?? '').trim() || null;

  if (!title && !hasArchived && !hasFinalizeTitle && !linkJobSlug) {
    return json({ ok: false, error: 'title, archived, linkJobSlug, or finalizeTitle is required' }, 400);
  }

  const loaded = await loadOwnerChatThread(userId, id);
  if (!loaded) return json({ ok: false, error: 'Session not found' }, 404);
  const { ownerUserId, thread } = loaded;

  if (linkJobSlug) {
    const linked = await linkProjectItem(linkJobSlug, 'chat', id);
    if (!linked) return json({ ok: false, error: 'Failed to link project' }, 500);
    const linked_jobs = await listJobsForItem('chat', id);
    return json({ ok: true, id, linked_jobs });
  }

  let currentTitle = thread.title;

  if (hasFinalizeTitle) {
    const ensured = await storeEnsureChatTitle(ownerUserId, id);
    if (ensured) currentTitle = ensured;
  }

  if (hasArchived) {
    const updated = await storeSetChatArchived(ownerUserId, id, body.archived as boolean);
    if (!updated) return json({ ok: false, error: 'Failed to update chat' }, 500);
    return json({ ok: true, id, archived: body.archived, title: currentTitle });
  }

  if (title) {
    const updated = await storeUpdateChatTitle(ownerUserId, id, title);
    if (!updated) return json({ ok: false, error: 'Failed to update title' }, 500);
    return json({ ok: true, id, title });
  }

  return json({ ok: true, id, title: currentTitle });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing thread id' }, 400);

  const ownerUserId = await resolveChatThreadOwnerUserId(userId, id);
  if (!ownerUserId) return json({ ok: false, error: 'Session not found' }, 404);

  const deleted = await storeDeleteChatThread(ownerUserId, id);
  if (!deleted) return json({ ok: false, error: 'Session not found' }, 404);
  return json({ ok: true, id });
}
