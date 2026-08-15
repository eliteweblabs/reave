/**
 * Siri Shortcuts → knowledge agent.
 *
 * Creates (or continues) an owner chat thread, runs Claude with sleep-mode
 * bypass, and returns a spoken reply when the turn finishes in time.
 * Longer runs keep going in the background and push when done.
 */

import { agentAlertUserId } from './adminAgentAlert';
import { clearAgentProgress, getAgentProgress, setAgentProgress } from './agentProgress';
import {
  cancelAgentRun,
  clearAgentRun,
  isAgentRunActive,
  registerAgentRun,
} from './agentRunControl';
import { describeAgentFailure } from './agentFailure';
import { runKnowledgeAgent } from './agentRunner';
import {
  createAgentDeadline,
  formatSeconds,
  isAgentTimeoutError,
  withDeadline,
} from './agentWatchdog';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeEnsureChatTitle,
  storeGetChatThread,
  storeUpdateChatTitle,
} from './chatStore';
import { titleFromMessage } from './chatTypes';
import { flushDeferredDeploy, formatFlushFailureNote } from './deferredDeploy';
import {
  chatDeployLockMessage,
  getDeployStatus,
  isChatLockedForDeploy,
} from './deployStatus';
import { createLogger } from './logger';
import { truncateNotificationText } from './notificationFormat';
import { getAliveAgentRunLease } from './pgAgentRunLeases';
import { isProcessDraining } from './processDrain';
import { serverEnv } from './serverEnv';
import { sendPushNotification } from './webPush';

const log = createLogger('siri-prompt');

/** How long Siri waits for a spoken reply before we ack and finish in the background. */
export const SIRI_PROMPT_WAIT_MS = 45_000;
const SPOKEN_REPLY_MAX = 700;

export type SiriPromptResult =
  | {
      ok: true;
      text: string;
      data: {
        threadId: string;
        started?: boolean;
        reply?: string;
      };
    }
  | { ok: false; error: string; text?: string };

function pickPrompt(params: Record<string, unknown>): string {
  return String(
    params.message ?? params.prompt ?? params.text ?? params.query ?? params.q ?? '',
  ).trim();
}

function isTruthyFlag(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'async';
}

function isFalseyWait(raw: unknown): boolean {
  if (raw === false || raw === 0) return true;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === '0' || s === 'false' || s === 'no';
}

/** Plain text Siri can read aloud — strips markdown / button fences and caps length. */
export function spokenSiriReply(reply: string): string {
  let text = reply.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '');
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/```$/, '');
    return inner.trim();
  });
  text = text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`#]+/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  if (!text) return 'Done. Open the Reave chat for the full reply.';
  if (text.length <= SPOKEN_REPLY_MAX) return text;
  const slice = text.slice(0, SPOKEN_REPLY_MAX);
  const atSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
  );
  const clipped = (atSentence >= 80 ? slice.slice(0, atSentence + 1) : slice).trim();
  return `${clipped} The rest is in the Reave chat.`;
}

function interruptedReplyText(userId: string, threadId: string, errorMessage?: string): string {
  const partial = getAgentProgress(userId, threadId)?.partialText?.trim() ?? '';
  const note = `_(This response did not finish — the run failed: ${errorMessage || 'unknown error'}.)_`;
  return partial ? `${partial}\n\n${note}` : note;
}

async function persistAssistantReply(userId: string, threadId: string, reply: string): Promise<void> {
  const assistantMessage = { role: 'assistant' as const, content: reply };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const saved = await storeAppendChatMessages(userId, threadId, [assistantMessage]);
      if (saved) return;
    } catch {
      /* retry */
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  log.warn('failed to persist Siri assistant reply', { threadId });
}

async function finishTurn(userId: string, threadId: string): Promise<void> {
  const flush = await flushDeferredDeploy(userId, threadId);
  if (!flush.ok) {
    const note = formatFlushFailureNote(flush);
    if (note) {
      try {
        await storeAppendChatMessages(userId, threadId, [{ role: 'assistant', content: note }]);
      } catch {
        /* best effort */
      }
    }
  }
}

async function notifySiriPromptComplete(opts: {
  threadId: string;
  prompt: string;
  reply: string;
}): Promise<void> {
  const spoken = spokenSiriReply(opts.reply);
  const title = truncateNotificationText(`Siri · ${titleFromMessage(opts.prompt)}`, 120);
  await sendPushNotification({
    title,
    body: spoken,
    tag: `siri-prompt-${opts.threadId}`,
    url: `/admin?tab=chats&chat=${encodeURIComponent(opts.threadId)}`,
    bypassQuietHours: true,
  }).catch((e) => log.warn('siri prompt push failed', e));
}

async function runSiriAgentTurn(opts: {
  userId: string;
  threadId: string;
  prompt: string;
  priorTurns: { role: 'user' | 'assistant'; content: string }[];
  notify: boolean;
}): Promise<{ reply: string }> {
  const { userId, threadId, prompt } = opts;
  clearAgentProgress(userId, threadId);
  setAgentProgress(userId, threadId, { phase: 'thinking', round: 0 });
  const runSignal = registerAgentRun(userId, threadId);
  const deadline = createAgentDeadline();
  let reply = '';
  try {
    const result = await withDeadline(
      runKnowledgeAgent({
        userText: prompt,
        priorTurns: opts.priorTurns,
        context: {
          userId,
          threadId,
          bypassSleepMode: true,
          siriVoice: true,
        },
        signal: runSignal,
        deadline,
      }),
      deadline.totalMs + 45_000,
      'Siri agent run',
    );
    reply = result.text;
  } catch (err) {
    if (isAgentTimeoutError(err)) cancelAgentRun(userId, threadId);
    const msg = isAgentTimeoutError(err)
      ? `no response after ${formatSeconds(deadline.totalMs)}`
      : describeAgentFailure(err);
    reply = interruptedReplyText(userId, threadId, msg);
  } finally {
    clearAgentProgress(userId, threadId);
    clearAgentRun(userId, threadId, runSignal);
  }

  const text = reply.trim() || interruptedReplyText(userId, threadId, 'empty reply');
  await persistAssistantReply(userId, threadId, text);
  await finishTurn(userId, threadId);
  try {
    await storeEnsureChatTitle(userId, threadId);
  } catch {
    /* title is cosmetic */
  }
  if (opts.notify) {
    await notifySiriPromptComplete({ threadId, prompt, reply: text });
  }
  return { reply: text };
}

/**
 * Ask the knowledge agent from a Siri Shortcut.
 *
 * Default: wait up to SIRI_PROMPT_WAIT_MS for a spoken reply. Pass
 * `async: true` (or `wait: false`) to return immediately and push when done.
 * Pass `thread_id` to continue an existing owner chat.
 */
export async function startSiriAgentPrompt(
  params: Record<string, unknown>,
): Promise<SiriPromptResult> {
  const prompt = pickPrompt(params);
  if (!prompt) {
    const msg = 'What should I ask the agent?';
    return { ok: false, error: 'message is required', text: msg };
  }

  if (!serverEnv('ANTHROPIC_API_KEY')?.trim()) {
    const msg = 'Claude is not configured on this install.';
    return { ok: false, error: msg, text: msg };
  }

  const userId = agentAlertUserId();
  if (!userId) {
    const msg = 'AGENT_ALERT_USER_ID is not set — Siri prompts need an owner chat to land in.';
    return { ok: false, error: msg, text: msg };
  }

  if (isProcessDraining()) {
    const msg = 'The server is restarting for a deploy. Try again in a moment.';
    return { ok: false, error: msg, text: msg };
  }

  const deployStatus = await getDeployStatus();
  if (isChatLockedForDeploy(deployStatus)) {
    const msg = chatDeployLockMessage(deployStatus!);
    return { ok: false, error: msg, text: msg };
  }

  const existingId = String(params.thread_id ?? params.threadId ?? params.thread ?? '').trim();
  let threadId: string;
  let priorTurns: { role: 'user' | 'assistant'; content: string }[] = [];

  if (existingId) {
    const thread = await storeGetChatThread(userId, existingId);
    if (!thread) {
      const msg = 'That chat was not found.';
      return { ok: false, error: msg, text: msg };
    }
    threadId = thread.id;
    priorTurns = thread.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  } else {
    const created = await storeCreateChatThread(userId);
    if (!created) {
      const msg = 'Could not start a chat for that prompt.';
      return { ok: false, error: msg, text: msg };
    }
    threadId = created.id;
    await storeUpdateChatTitle(userId, threadId, `Siri · ${titleFromMessage(prompt)}`);
  }

  if (isAgentRunActive(userId, threadId) || (await getAliveAgentRunLease(userId, threadId))) {
    const msg = 'That chat is still working on a reply. Try again in a moment.';
    return { ok: false, error: msg, text: msg };
  }

  const saved = await storeAppendChatMessages(userId, threadId, [{ role: 'user', content: prompt }]);
  if (!saved) {
    const msg = 'Could not save that prompt.';
    return { ok: false, error: msg, text: msg };
  }

  const wait = !isTruthyFlag(params.async) && !isFalseyWait(params.wait);
  const runPromise = runSiriAgentTurn({
    userId,
    threadId,
    prompt,
    priorTurns,
    notify: !wait,
  });

  if (!wait) {
    runPromise.catch((e) => {
      log.error('background Siri prompt failed', e instanceof Error ? e : new Error(String(e)));
    });
    return {
      ok: true,
      text: 'Sent. I will notify you when the agent replies.',
      data: { threadId, started: true },
    };
  }

  const raced = await Promise.race([
    runPromise.then((r) => ({ done: true as const, reply: r.reply })),
    new Promise<{ done: false }>((resolve) => {
      setTimeout(() => resolve({ done: false }), SIRI_PROMPT_WAIT_MS);
    }),
  ]);

  if (raced.done) {
    return {
      ok: true,
      text: spokenSiriReply(raced.reply),
      data: { threadId, reply: raced.reply },
    };
  }

  runPromise
    .then((r) => notifySiriPromptComplete({ threadId, prompt, reply: r.reply }))
    .catch((e) => {
      log.error('background Siri prompt failed', e instanceof Error ? e : new Error(String(e)));
    });

  return {
    ok: true,
    text: 'Working on that. I will notify you when it is ready.',
    data: { threadId, started: true },
  };
}
