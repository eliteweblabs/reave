/**
 * System alerts — each event opens its own chat thread (no shared inbox).
 * Extracted from adminAgentAlert to avoid circular imports with deployIncidentHandler.
 */
import { serverEnv } from './serverEnv';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeUpdateChatTitle,
} from './chatStore';
import { titleFromMessage } from './chatTypes';
import { runKnowledgeAgent } from './agentRunner';
import { prependDeployBanner } from './deployStatus';
import { sendPushNotification } from './webPush';
import { isSleepModeActive } from './pushQuietHours';
import { createLogger } from './logger';

const log = createLogger('system-alerts');

export function agentAlertUserId(): string | null {
  return serverEnv('AGENT_ALERT_USER_ID')?.trim() || null;
}

function alertThreadTitle(opts: { message: string; push?: { title: string } }): string {
  const fromPush = opts.push?.title?.trim();
  if (fromPush) return titleFromMessage(fromPush);
  const firstLine =
    opts.message
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  return titleFromMessage(firstLine || 'System alert');
}

/** One isolated chat per alert — event threads never append to an existing alert. */
async function createAlertThread(userId: string, title: string): Promise<string | null> {
  const created = await storeCreateChatThread(userId);
  if (!created) return null;
  await storeUpdateChatTitle(userId, created.id, title);
  return created.id;
}

/**
 * Opens a new alert chat for this event, optionally running the agent once.
 * Returns the agent reply when autoRun is true.
 */
export async function postToSystemAlertsThread(opts: {
  message: string;
  autoRun?: boolean;
  emailId?: string;
  model?: string;
  push?: { title: string; body: string; tag?: string; url?: string };
}): Promise<{ threadId?: string; agentReply?: string }> {
  const userId = agentAlertUserId();
  if (!userId) return {};

  if (await isSleepModeActive()) {
    log.info('sleep mode — system alert suppressed');
    return {};
  }

  try {
    const title = alertThreadTitle(opts);
    const threadId = await createAlertThread(userId, title);
    if (!threadId) {
      log.warn('could not create alert chat thread');
      return {};
    }

    const priorTurns: { role: 'user' | 'assistant'; content: string }[] = [];
    const autoRun = opts.autoRun !== false && serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';
    const agentContext = opts.emailId
      ? { userId, threadId, emailId: opts.emailId, systemAlert: true }
      : { userId, threadId, systemAlert: true };

    let agentReply: string | undefined;

    if (autoRun) {
      let reply = await runKnowledgeAgent({
        userText: opts.message,
        priorTurns,
        model: opts.model ?? null,
        context: agentContext,
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
        tag: opts.push.tag ?? `system-alert-${threadId}`,
        url: opts.push.url ?? `/admin?tab=chats&chat=${encodeURIComponent(threadId)}`,
      }).catch((e) => log.warn('push failed', e));
    }

    log.info('alert posted', { threadId, title });
    return { threadId, agentReply };
  } catch (e) {
    log.warn('notify failed', e);
    return {};
  }
}
