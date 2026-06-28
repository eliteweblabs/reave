/**
 * Post inbound alert emails into the admin agent "System alerts" chat thread.
 */

import { serverEnv } from './serverEnv';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeGetChatThread,
  storeListChatThreads,
  storeUpdateChatTitle,
} from './chatStore';
import { runTelegramKnowledgeAgent } from './telegramAgent';
import type { TelegramChatTurn } from './telegramChatHistory';

const ALERT_THREAD_TITLE = 'System alerts';

export function agentAlertUserId(): string | null {
  return serverEnv('AGENT_ALERT_USER_ID')?.trim() || null;
}

export function isRailwayAlertStatus(status: string): boolean {
  return status.toUpperCase().startsWith('RAILWAY');
}

async function getOrCreateAlertThread(userId: string): Promise<string | null> {
  const threads = await storeListChatThreads(userId);
  const existing = threads.find((t) => t.title === ALERT_THREAD_TITLE);
  if (existing) return existing.id;

  const created = await storeCreateChatThread(userId);
  if (!created) return null;
  await storeUpdateChatTitle(userId, created.id, ALERT_THREAD_TITLE);
  return created.id;
}

function formatAlertMessage(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
}): string {
  const railway = isRailwayAlertStatus(opts.status);
  const intro = railway
    ? 'Railway alert email received (deploy/build crash notification). This is sometimes a false alarm during rollout while the new deployment is still starting — verify in the Railway dashboard before acting.'
    : 'Inbound alert email received.';

  return [
    intro,
    '',
    `Status: ${opts.status}`,
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    '',
    opts.summary,
    opts.bodySnippet ? `\nSnippet:\n${opts.bodySnippet.slice(0, 1200)}` : '',
    '',
    railway
      ? 'Check Railway deploy logs, distinguish rollout teardown vs a real crash, and suggest next steps.'
      : 'Summarize severity and suggest next steps.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/** Fire-and-forget — logs failures, never throws to inbound email handler. */
export async function notifyAdminAgentOfEmailAlert(opts: {
  status: string;
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
  category: string;
}): Promise<void> {
  const userId = agentAlertUserId();
  if (!userId) return;

  if (opts.category !== 'alert' && !isRailwayAlertStatus(opts.status)) return;

  try {
    const threadId = await getOrCreateAlertThread(userId);
    if (!threadId) {
      console.warn('[email-agent] could not open System alerts thread');
      return;
    }

    const thread = await storeGetChatThread(userId, threadId);
    const priorTurns: TelegramChatTurn[] = (thread?.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userMessage = formatAlertMessage(opts);
    const autoRun = serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';

    if (autoRun) {
      const reply = await runTelegramKnowledgeAgent({
        userText: userMessage,
        priorTurns,
      });
      await storeAppendChatMessages(userId, threadId, [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]);
    } else {
      await storeAppendChatMessages(userId, threadId, [{ role: 'user', content: userMessage }]);
    }

    console.info('[email-agent] alert posted', { threadId, status: opts.status });
  } catch (e) {
    console.warn('[email-agent] notify failed', e);
  }
}
