/**
 * System alerts chat thread — posts messages and optional auto-investigation.
 * Extracted from adminAgentAlert to avoid circular imports with deployIncidentHandler.
 */
import { serverEnv } from './serverEnv';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeListChatThreads,
  storeUpdateChatTitle,
} from './chatStore';
import { runKnowledgeAgent } from './agentRunner';
import { prependDeployBanner } from './deployStatus';
import { sendPushNotification } from './webPush';
import { createLogger } from './logger';

const log = createLogger('system-alerts');

const ALERT_THREAD_TITLE = 'System alerts';

export function agentAlertUserId(): string | null {
  return serverEnv('AGENT_ALERT_USER_ID')?.trim() || null;
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

/**
 * Posts a message to the System alerts thread, optionally running the agent.
 * Returns the agent reply when autoRun is true.
 */
export async function postToSystemAlertsThread(opts: {
  message: string;
  autoRun?: boolean;
  emailId?: string;
  model?: string;
  push?: { title: string; body: string; tag?: string; url?: string };
}): Promise<{ agentReply?: string }> {
  const userId = agentAlertUserId();
  if (!userId) return {};

  try {
    const threadId = await getOrCreateAlertThread(userId);
    if (!threadId) {
      log.warn('could not open System alerts thread');
      return {};
    }

    const priorTurns: { role: 'user' | 'assistant'; content: string }[] = [];
    const autoRun = opts.autoRun !== false && serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';

    let agentReply: string | undefined;

    if (autoRun) {
      let reply = await runKnowledgeAgent({
        userText: opts.message,
        priorTurns,
        model: opts.model ?? null,
        context: opts.emailId
          ? { userId, emailId: opts.emailId, systemAlert: true }
          : { userId, systemAlert: true },
      });
      reply = await prependDeployBanner(reply, { userText: opts.message });
      await storeAppendChatMessages(userId, threadId, [
        { role: 'user', content: opts.message },
        { role: 'assistant', content: reply },
      ]);
      agentReply = reply;
    } else {
      await storeAppendChatMessages(userId, threadId, [{ role: 'user', content: opts.message }]);
    }

    if (opts.push) {
      sendPushNotification({
        title: opts.push.title,
        body: opts.push.body,
        tag: opts.push.tag ?? 'system-alert',
        url: opts.push.url ?? '/admin?tab=chats',
      }).catch((e) => log.warn('push failed', e));
    }

    log.info('alert posted', { threadId });
    return { agentReply };
  } catch (e) {
    log.warn('notify failed', e);
    return {};
  }
}
