/**
 * System alerts — each distinct event opens its own chat thread.
 * Deploy-failure repairs are the exception: the same service reuses one
 * Session so the agent can continue fixing instead of starting over.
 */
import { serverEnv } from './serverEnv';
import {
  storeAppendChatMessages,
  storeCreateChatThread,
  storeGetChatThread,
  storeListChatThreads,
  storeUpdateChatTitle,
} from './chatStore';
import { titleFromMessage, type ChatTurn } from './chatTypes';
import { runKnowledgeAgent } from './agentRunner';
import { prependDeployBanner } from './deployStatus';
import { sendPushNotification } from './webPush';
import { isSleepModeActive } from './pushQuietHours';
import { createLogger } from './logger';
import type { PushAlertKind } from './pushAlertStore';
import {
  clearAgentRun,
  isAgentRunActive,
  registerAgentRun,
} from './agentRunControl';
import { getAliveAgentRunLease } from './pgAgentRunLeases';
import {
  DEPLOY_FAILURE_MAX_AUTO_RUNS,
  DEPLOY_FAILURE_RERUN_COOLDOWN_MS,
  DEPLOY_FAILURE_REUSE_MS,
  findReusableAlertThread,
  lastAssistantIsUnresolved,
  lastAssistantTurn,
  shouldAutoRunRepairFollowUp,
} from './agentSituationalContext';

const log = createLogger('system-alerts');

const reuseLocks = new Map<string, Promise<unknown>>();

async function withReuseLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = reuseLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => held);
  reuseLocks.set(key, chain);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (reuseLocks.get(key) === chain) reuseLocks.delete(key);
  }
}

/** Clerk user ids allowed as deployment owners (`AGENT_ALERT_USER_ID`, comma-separated). */
export function agentAlertUserIds(): string[] {
  return (serverEnv('AGENT_ALERT_USER_ID') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Primary owner id — first entry, used for System alerts threads. */
export function agentAlertUserId(): string | null {
  return agentAlertUserIds()[0] ?? null;
}

function alertThreadTitle(opts: { message: string; push?: { title: string }; reuseTitle?: string }): string {
  const reuse = opts.reuseTitle?.trim();
  if (reuse) return titleFromMessage(reuse);
  const fromPush = opts.push?.title?.trim();
  if (fromPush) return titleFromMessage(fromPush);
  const firstLine =
    opts.message
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  return titleFromMessage(firstLine || 'System alert');
}

async function createAlertThread(userId: string, title: string): Promise<string | null> {
  const created = await storeCreateChatThread(userId);
  if (!created) return null;
  await storeUpdateChatTitle(userId, created.id, title);
  return created.id;
}

function turnsFromThread(messages: Array<{ role: ChatTurn['role']; content: string }>): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function threadRunIsActive(userId: string, threadId: string): Promise<boolean> {
  if (isAgentRunActive(userId, threadId)) return true;
  return Boolean(await getAliveAgentRunLease(userId, threadId));
}

/**
 * Opens a new alert chat for this event, optionally running the agent once.
 * Pass `reuseTitle` to continue an existing matching Session (deploy repair).
 * Returns the agent reply when autoRun is true.
 */
export async function postToSystemAlertsThread(opts: {
  message: string;
  autoRun?: boolean;
  emailId?: string;
  model?: string;
  /** Deploy auto-repair must not wait for quiet hours to end. */
  bypassSleep?: boolean;
  /**
   * When set, reuse a fresh Session with this title instead of opening another.
   * Used by deploy-failure repair so crash loops stay in one thread.
   */
  reuseTitle?: string;
  reuseMaxAgeMs?: number;
  /** Extra tool-round budget so a repair can actually ship a fix. */
  repairRun?: boolean;
  push?: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    urgent?: boolean;
    kind?: PushAlertKind;
    /** When true, skip the dismissible dashboard mirror (engagement banner already covers it). */
    skipDashboardAlert?: boolean;
  };
}): Promise<{
  threadId?: string;
  agentReply?: string;
  reused?: boolean;
  suppressed?: boolean;
}> {
  const userId = agentAlertUserId();
  if (!userId) return {};

  if (!opts.bypassSleep && (await isSleepModeActive())) {
    log.info('sleep mode — system alert suppressed');
    return {};
  }

  const title = alertThreadTitle(opts);
  const reuseKey = opts.reuseTitle?.trim();

  const run = () => postAlertInner({ ...opts, userId, title });
  if (reuseKey) return withReuseLock(`${userId}:${reuseKey.toLowerCase()}`, run);
  return run();
}

async function postAlertInner(opts: {
  userId: string;
  title: string;
  message: string;
  autoRun?: boolean;
  emailId?: string;
  model?: string;
  reuseTitle?: string;
  reuseMaxAgeMs?: number;
  repairRun?: boolean;
  push?: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    urgent?: boolean;
    kind?: PushAlertKind;
    skipDashboardAlert?: boolean;
  };
}): Promise<{
  threadId?: string;
  agentReply?: string;
  reused?: boolean;
  suppressed?: boolean;
}> {
  const { userId, title } = opts;

  try {
    let threadId: string | null = null;
    let priorTurns: ChatTurn[] = [];
    let reused = false;
    let lastAssistantAtMs: number | null = null;

    if (opts.reuseTitle?.trim()) {
      const threads = await storeListChatThreads(userId, { archivedOnly: false });
      const existing = findReusableAlertThread(
        threads,
        title,
        Date.now(),
        opts.reuseMaxAgeMs ?? DEPLOY_FAILURE_REUSE_MS,
      );
      if (existing) {
        const detail = await storeGetChatThread(userId, existing.id);
        if (detail) {
          threadId = existing.id;
          priorTurns = turnsFromThread(detail.messages);
          reused = true;
          for (let i = detail.messages.length - 1; i >= 0; i--) {
            const msg = detail.messages[i];
            if (msg?.role === 'assistant') {
              const at = Date.parse(msg.created_at);
              lastAssistantAtMs = Number.isFinite(at) ? at : null;
              break;
            }
          }
        }
      }
    }

    if (!threadId) {
      threadId = await createAlertThread(userId, title);
      if (!threadId) {
        log.warn('could not create alert chat thread');
        return {};
      }
    }

    const autoRun = opts.autoRun !== false && serverEnv('AGENT_ALERT_AUTO_RUN') !== '0';
    const agentContext = {
      userId,
      threadId,
      systemAlert: true as const,
      ...(opts.emailId ? { emailId: opts.emailId } : {}),
      ...(opts.repairRun ? { repairRun: true as const } : {}),
    };

    let agentReply: string | undefined;
    let suppressed = false;

    if (reused && autoRun) {
      const last = lastAssistantTurn(priorTurns);
      const assistantRunCount = priorTurns.filter((t) => t.role === 'assistant').length;
      const decision = shouldAutoRunRepairFollowUp({
        runActive: await threadRunIsActive(userId, threadId),
        lastAssistantAtMs,
        lastAssistantUnresolved: last ? lastAssistantIsUnresolved(last.content) : false,
        assistantRunCount,
        nowMs: Date.now(),
        cooldownMs: DEPLOY_FAILURE_RERUN_COOLDOWN_MS,
        maxAutoRuns: DEPLOY_FAILURE_MAX_AUTO_RUNS,
      });

      if (decision !== 'run') {
        const note =
          decision === 'suppress-exhausted'
            ? `\n\n(Auto-repair stopped after ${DEPLOY_FAILURE_MAX_AUTO_RUNS} attempts on this Session. The previous successful deploy is still live. Owner can continue this chat to try again.)`
            : '';
        await storeAppendChatMessages(userId, threadId, [
          { role: 'user', content: `${opts.message}${note}` },
        ]);
        suppressed = true;
        log.info('repair follow-up suppressed', { threadId, title, reason: decision, assistantRunCount });
      }
    }

    if (autoRun && !suppressed) {
      const runSignal = registerAgentRun(userId, threadId);
      const userText = reused
        ? `FOLLOW-UP — same service failed again. Continue this Session. Read your prior turns before you act. Do not start over. Do not open another Session.\n\n${opts.message}`
        : opts.message;
      try {
        const result = await runKnowledgeAgent({
          userText,
          priorTurns,
          model: opts.model ?? null,
          context: agentContext,
          signal: runSignal,
        });
        const reply = await prependDeployBanner(result.text, { userText: opts.message });
        await storeAppendChatMessages(userId, threadId, [
          { role: 'user', content: userText },
          { role: 'assistant', content: reply, agent_usage: result.usage },
        ]);
        agentReply = reply;
      } finally {
        clearAgentRun(userId, threadId, runSignal);
      }
    } else if (!autoRun || suppressed) {
      if (!suppressed) {
        await storeAppendChatMessages(userId, threadId, [{ role: 'user', content: opts.message }]);
      }
    }

    if (opts.push && !suppressed) {
      sendPushNotification({
        title: opts.push.title,
        body: opts.push.body,
        tag: opts.push.tag ?? `system-alert-${threadId}`,
        url: opts.push.url ?? `/admin?tab=chats&chat=${encodeURIComponent(threadId)}`,
        urgent: opts.push.urgent,
        kind: opts.push.kind,
        skipDashboardAlert: opts.push.skipDashboardAlert,
      }).catch((e) =>
        log.warn('push failed', { error: e instanceof Error ? e.message : String(e) }),
      );
    }

    log.info('alert posted', { threadId, title, reused, suppressed });
    return { threadId, agentReply, reused, suppressed };
  } catch (e) {
    log.warn('notify failed', { error: e instanceof Error ? e.message : String(e) });
    return {};
  }
}
