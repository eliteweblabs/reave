/**
 * Deploy resume — continue the same admin chat after a Railway deploy lands.
 *
 * Register: the agent can call set_deploy_resume, and a default resume is also
 * registered automatically when a chat turn flushes commits to main.
 * Trigger: railwayWebhookHandler on deploy-success, plus the new replica's
 * liveness probe (covers a missed or old-replica webhook).
 * Storage: single row in Postgres (deploy_resume table).
 */
import pg from 'pg';
import { clearAgentProgress, getAgentProgress, setAgentProgress } from './agentProgress';
import {
  cancelAgentRun,
  clearAgentRun,
  isAgentRunActive,
  registerAgentRun,
} from './agentRunControl';
import { describeAgentFailure } from './agentFailure';
import {
  createAgentDeadline,
  formatSeconds,
  isAgentTimeoutError,
  withDeadline,
} from './agentWatchdog';
import {
  storeAppendChatMessages,
  storeEnsureChatTitle,
  storeGetChatThread,
  storeGetChatThreadOwnerUserId,
} from './chatStore';
import { getAliveAgentRunLease } from './pgAgentRunLeases';
import { isProcessDraining } from './processDrain';
import { serverEnv } from './serverEnv';
import { createLogger } from './logger';

const log = createLogger('deploy-resume');

export type DeployResumeRow = {
  thread_id: string;
  message: string;
  registered_at: string;
  expires_at: string;
  registered_deployment_id: string | null;
};

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS deploy_resume (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  thread_id TEXT NOT NULL,
  message TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  registered_deployment_id TEXT
);
`;

const MIGRATE_SQL = `
ALTER TABLE deploy_resume ADD COLUMN IF NOT EXISTS registered_deployment_id TEXT;
`;

const RESUME_TTL_MS = 30 * 60 * 1_000; // 30 minutes

export const DEFAULT_DEPLOY_RESUME_MESSAGE =
  'Railway just finished deploying. Continue this thread: verify the latest change is live and finish anything that was waiting on the deploy. If the work is already complete, say so briefly and stop.';

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _triggering = false;

function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  const url = databaseUrl();
  if (!url) { _pool = null; return null; }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 2 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool.query(CREATE_SQL)
      .then(() => pool.query(MIGRATE_SQL))
      .then(() => undefined)
      .catch((err) => { _schemaReady = null; throw err; });
  }
  await _schemaReady;
  return pool;
}

export function railwayDeploymentId(): string | null {
  return serverEnv('RAILWAY_DEPLOYMENT_ID')?.trim() || null;
}

/** Register a deploy-resume payload. Overwrites any existing one. */
export async function setDeployResume(
  threadId: string,
  message: string,
): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    const expiresAt = new Date(Date.now() + RESUME_TTL_MS).toISOString();
    const deploymentId = railwayDeploymentId();
    await pool.query(
      `INSERT INTO deploy_resume (id, thread_id, message, registered_at, expires_at, registered_deployment_id)
       VALUES (1, $1, $2, NOW(), $3::timestamptz, $4)
       ON CONFLICT (id) DO UPDATE SET
         thread_id = EXCLUDED.thread_id,
         message = EXCLUDED.message,
         registered_at = NOW(),
         expires_at = EXCLUDED.expires_at,
         registered_deployment_id = EXCLUDED.registered_deployment_id`,
      [threadId, message, expiresAt, deploymentId],
    );
    log.info('deploy resume registered', { threadId });
  } catch (err) {
    log.warn('setDeployResume failed', { error: err instanceof Error ? err.message : err });
  }
}

/**
 * Register the default continuation unless this thread already has a custom
 * resume (from set_deploy_resume). A different thread's pending row is replaced
 * so the chat that just shipped wins.
 */
export async function ensureDefaultDeployResume(threadId: string): Promise<void> {
  const existing = await peekDeployResume();
  if (existing?.thread_id === threadId) return;
  await setDeployResume(threadId, DEFAULT_DEPLOY_RESUME_MESSAGE);
}

/** Fetch the pending deploy-resume payload without clearing it. */
export async function peekDeployResume(): Promise<DeployResumeRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<DeployResumeRow>(
      `SELECT thread_id, message, registered_at::text, expires_at::text, registered_deployment_id
       FROM deploy_resume WHERE id = 1 AND expires_at > NOW()`,
    );
    return rows[0] ?? null;
  } catch (err) {
    log.warn('peekDeployResume failed', { error: err instanceof Error ? err.message : err });
    return null;
  }
}

/** Fetch and clear the pending deploy-resume payload (if not expired). */
export async function popDeployResume(): Promise<DeployResumeRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<DeployResumeRow>(
      `DELETE FROM deploy_resume WHERE id = 1 AND expires_at > NOW()
       RETURNING thread_id, message, registered_at::text, expires_at::text, registered_deployment_id`,
    );
    return rows[0] ?? null;
  } catch (err) {
    log.warn('popDeployResume failed', { error: err instanceof Error ? err.message : err });
    return null;
  }
}

function isNewReplica(resume: DeployResumeRow): boolean {
  const current = railwayDeploymentId();
  if (!current || !resume.registered_deployment_id) return false;
  return current !== resume.registered_deployment_id;
}

/**
 * Called from railwayWebhookHandler on deploy success (any service in the project).
 * If a resume is registered, posts the continuation into the stored thread.
 */
export async function triggerDeployResume(): Promise<void> {
  await fireDeployResume({ requireNewReplica: false });
}

/**
 * New-replica safety net when the success webhook hit a draining instance or
 * never arrived. Only fires when this process's RAILWAY_DEPLOYMENT_ID differs
 * from the one stored at register time.
 */
export async function maybeTriggerDeployResumeOnNewReplica(): Promise<void> {
  await fireDeployResume({ requireNewReplica: true });
}

async function fireDeployResume(opts: { requireNewReplica: boolean }): Promise<void> {
  if (_triggering || isProcessDraining()) return;

  const pending = await peekDeployResume();
  if (!pending) return;
  if (opts.requireNewReplica && !isNewReplica(pending)) return;

  _triggering = true;
  try {
    const ownerUserId =
      (await storeGetChatThreadOwnerUserId(pending.thread_id)) ||
      serverEnv('AGENT_ALERT_USER_ID')?.trim() ||
      null;
    if (!ownerUserId) {
      log.warn('deploy resume skipped — no thread owner');
      return;
    }

    if (
      isAgentRunActive(ownerUserId, pending.thread_id) ||
      (await getAliveAgentRunLease(ownerUserId, pending.thread_id))
    ) {
      log.info('deploy resume deferred — thread already running', { threadId: pending.thread_id });
      return;
    }

    const resume = await popDeployResume();
    if (!resume) return;

    log.info('triggering deploy resume', { threadId: resume.thread_id });

    try {
      await runResumeOnThread(ownerUserId, resume);
      log.info('deploy resume posted', { threadId: resume.thread_id });
    } catch (err) {
      log.warn('deploy resume post failed', { error: err instanceof Error ? err.message : err });
      await setDeployResume(resume.thread_id, resume.message);
    }
  } finally {
    _triggering = false;
  }
}

async function persistAssistantReply(
  userId: string,
  threadId: string,
  reply: string,
): Promise<void> {
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
  log.warn('failed to persist deploy-resume assistant reply', { threadId });
}

function interruptedReplyText(userId: string, threadId: string, errorMessage?: string): string {
  const partial = getAgentProgress(userId, threadId)?.partialText?.trim() ?? '';
  const note = `_(This response did not finish — the run failed: ${errorMessage || 'unknown error'}.)_`;
  return partial ? `${partial}\n\n${note}` : note;
}

async function runResumeOnThread(userId: string, resume: DeployResumeRow): Promise<void> {
  const thread = await storeGetChatThread(userId, resume.thread_id);
  if (!thread) {
    log.warn('deploy resume skipped — thread not found', { threadId: resume.thread_id });
    return;
  }

  const priorTurns = thread.messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const saved = await storeAppendChatMessages(userId, resume.thread_id, [
    { role: 'user', content: resume.message },
  ]);
  if (!saved) {
    throw new Error('could not append resume message');
  }

  clearAgentProgress(userId, resume.thread_id);
  setAgentProgress(userId, resume.thread_id, { phase: 'thinking', round: 0 });
  const runSignal = registerAgentRun(userId, resume.thread_id);
  const deadline = createAgentDeadline();
  let reply = '';

  try {
    const { runKnowledgeAgent } = await import('./agentRunner');
    const result = await withDeadline(
      runKnowledgeAgent({
        userText: resume.message,
        priorTurns,
        context: {
          userId,
          threadId: resume.thread_id,
          bypassSleepMode: true,
        },
        signal: runSignal,
        deadline,
      }),
      deadline.totalMs + 45_000,
      'Deploy resume agent run',
    );
    reply = result.text;
  } catch (err) {
    if (isAgentTimeoutError(err)) cancelAgentRun(userId, resume.thread_id);
    const msg = isAgentTimeoutError(err)
      ? `no response after ${formatSeconds(deadline.totalMs)}`
      : describeAgentFailure(err);
    reply = interruptedReplyText(userId, resume.thread_id, msg);
  } finally {
    clearAgentProgress(userId, resume.thread_id);
    clearAgentRun(userId, resume.thread_id, runSignal);
  }

  const text = reply.trim() || interruptedReplyText(userId, resume.thread_id, 'empty reply');
  const { prependDeployBanner } = await import('./deployStatus');
  const bannered = await prependDeployBanner(text, { userText: resume.message });
  await persistAssistantReply(userId, resume.thread_id, bannered);
  try {
    await storeEnsureChatTitle(userId, resume.thread_id);
  } catch {
    /* title is cosmetic */
  }

  const { flushDeferredDeploy, formatFlushFailureNote } = await import('./deferredDeploy');
  const flush = await flushDeferredDeploy(userId, resume.thread_id);
  if (!flush.ok) {
    const note = formatFlushFailureNote(flush);
    if (note) {
      try {
        await storeAppendChatMessages(userId, resume.thread_id, [{ role: 'assistant', content: note }]);
      } catch {
        /* best effort */
      }
    }
  }
}
