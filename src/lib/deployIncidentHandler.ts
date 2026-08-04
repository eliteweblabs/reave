/**
 * Central handler for Railway deploy failure alerts (webhook + email).
 *
 * One active incident per GitHub repo — duplicate emails/webhooks for the same
 * repo are suppressed so the agent never runs parallel repairs.
 */
import { postToSystemAlertsThread } from './systemAlertsThread';
import { resolveDeployTarget, deployDedupKey, type DeployServiceTarget } from './deployServiceMap';
import {
  dbAcquireDeployIncident,
  dbUpdateDeployIncident,
  isDeployIncidentsDbConfigured,
  type DeployIncidentRow,
} from './pgDeployIncidents';
import { checkDeploymentStatus } from './devStatus';
import { storeDeleteEmailInbox } from './emailInboxStore';
import { sendPushNotification } from './webPush';
import { serverEnv } from './serverEnv';
import { createLogger } from './logger';

const log = createLogger('deploy-incident');

const RAILWAY_ALERT_MODEL = 'claude-opus-4-6';
const VERIFY_DELAY_MS = 90_000;
const VERIFY_MAX_ATTEMPTS = 2;

/**
 * Auto-investigate Railway deploy failures (repo lock + Claude agent playbook).
 * Off by default during development — set RAILWAY_INCIDENT_HANDLER=1 to enable.
 */
export function isRailwayIncidentHandlerEnabled(): boolean {
  return serverEnv('RAILWAY_INCIDENT_HANDLER') === '1';
}

export type DeployFailureInput = {
  source: 'webhook' | 'email';
  /** Raw alert text posted to System alerts when investigation runs. */
  message: string;
  project?: string;
  service?: string;
  environment?: string;
  deploymentId?: string;
  commitSha?: string;
  emailId?: string;
  /** Email-only fields for target resolution when webhook metadata is sparse. */
  subject?: string;
  body?: string;
};

export type DeployFailureResult = {
  handled: boolean;
  suppressed: boolean;
  reason: string;
  incidentId?: string;
};

/** Structured outcome markers the agent must emit (see playbook). */
export function parseDeployOutcome(reply: string): 'resolved' | 'unresolved' | 'unknown' {
  if (/✅\s*RESOLVED/i.test(reply)) return 'resolved';
  if (/🚨\s*UNRESOLVED/i.test(reply)) return 'unresolved';
  return 'unknown';
}

/** Heuristic fallback when structured markers are missing. */
function heuristicResolved(reply: string): boolean {
  const lower = reply.toLowerCase();
  const unresolved = [
    'build failed',
    'build is failing',
    'deployment crashed',
    'crash loop',
    'health check failed',
    'not responding',
    'deploy is down',
    'site is down',
    'service is down',
    'investigate further',
    'requires your attention',
    'needs investigation',
    'stale deploy',
    'rollback',
    'behind by',
    'check railway logs',
    '🚨 unresolved',
  ];
  for (const phrase of unresolved) {
    if (lower.includes(phrase)) return false;
  }
  const resolved = [
    'already live',
    'deployment is live',
    'is live and healthy',
    'health check passed',
    'no real failure',
    'not a real crash',
    'rollout teardown',
    'old instance was terminated',
    'deploy succeeded',
    'latest commit is deployed',
    'latest commit is live',
    'no action needed',
    'no action required',
    'self-healed',
    'build succeeded',
    'currently healthy',
    'app is up',
    'app is live',
    '✅ resolved',
  ];
  for (const phrase of resolved) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

function extractFixCommitSha(reply: string): string | null {
  const urlMatch = reply.match(/github\.com\/[^/\s]+\/[^/\s]+\/commit\/([a-f0-9]{7,40})/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const shaMatch = reply.match(/\bcommit[_\s]?(?:sha)?[:\s]+([a-f0-9]{7,40})\b/i);
  return shaMatch?.[1] ?? null;
}

function buildInvestigationMessage(opts: {
  incident: DeployIncidentRow;
  target: DeployServiceTarget;
  baseMessage: string;
}): string {
  const lines = [
    opts.baseMessage,
    '',
    `INCIDENT ${opts.incident.id.slice(0, 8)} — repo lock acquired for ${opts.target.repo}`,
    `Project: ${opts.incident.project ?? '?'}`,
    `Service: ${opts.incident.service ?? '?'}`,
    `Environment: ${opts.incident.environment ?? '?'}`,
    opts.incident.deployment_id ? `Deployment: ${opts.incident.deployment_id}` : null,
    opts.incident.commit_sha ? `Commit: ${opts.incident.commit_sha}` : null,
    '',
    'MANDATORY PLAYBOOK — read_knowledge slug "railway-build-failure-triage" first, then:',
    `1. check_deployment_status(repo:"${opts.target.repo}"${opts.target.healthUrl ? `, health_url:"${opts.target.healthUrl}"` : ''})`,
    `2. get_git_status(repo:"${opts.target.repo}", with_files via get_recent_commits)`,
    '3. If rollout teardown / false alarm → end with "✅ RESOLVED — rollout teardown"',
    '4. If real failure → read changed files, fix via write_github_file(branch:"main"), report commit SHA',
    '5. End EVERY reply with exactly one line:',
    '   ✅ RESOLVED — <reason>   OR   🚨 UNRESOLVED — <what you tried + owner action>',
    '',
    'Do NOT ask the owner to fix it. Do NOT stop at diagnosis. Duplicate alerts for this repo are blocked until you close this incident.',
  ].filter(Boolean);
  return lines.join('\n');
}

async function silentDeleteEmail(emailId: string | undefined): Promise<void> {
  if (!emailId) return;
  storeDeleteEmailInbox(emailId).catch((e) => log.warn('email delete failed', e));
}

function scheduleVerifyLoop(opts: {
  incidentId: string;
  target: DeployServiceTarget;
  fixCommitSha: string;
  emailId?: string;
  attempt?: number;
}): void {
  const attempt = opts.attempt ?? 1;
  if (attempt > VERIFY_MAX_ATTEMPTS) {
    log.warn('verify loop exhausted', { incidentId: opts.incidentId, repo: opts.target.repo });
    return;
  }

  setTimeout(async () => {
    try {
      await dbUpdateDeployIncident(opts.incidentId, { status: 'verifying' });
      const status = await checkDeploymentStatus({
        repo: opts.target.repo,
        healthUrl: opts.target.healthUrl,
      });
      if (!status.ok) {
        log.warn('verify check failed', { error: status.error });
        return;
      }

      const healthy = status.data.up_to_date === true && status.data.health.reachable;
      if (healthy) {
        log.info('verify loop: deploy healthy', {
          incidentId: opts.incidentId,
          repo: opts.target.repo,
          fix: opts.fixCommitSha,
        });
        await dbUpdateDeployIncident(opts.incidentId, {
          status: 'resolved',
          resolution: 'fix_verified',
          fix_commit_sha: opts.fixCommitSha,
        });
        await silentDeleteEmail(opts.emailId);
        return;
      }

      if (attempt < VERIFY_MAX_ATTEMPTS) {
        scheduleVerifyLoop({ ...opts, attempt: attempt + 1 });
      } else {
        await dbUpdateDeployIncident(opts.incidentId, {
          status: 'escalated',
          resolution: 'fix_unverified',
        });
      }
    } catch (e) {
      log.warn('verify loop error', e);
    }
  }, VERIFY_DELAY_MS);
}

async function runInvestigation(opts: {
  incident: DeployIncidentRow;
  target: DeployServiceTarget;
  message: string;
  emailId?: string;
  pushOnUnresolved?: boolean;
  subject?: string;
}): Promise<void> {
  const incidentId = opts.incident.id;
  const canPersist = incidentId !== 'no-db';

  try {
    if (!serverEnv('AGENT_ALERT_USER_ID')?.trim()) {
      log.warn('AGENT_ALERT_USER_ID missing — incident recorded but no agent run');
      if (canPersist) {
        await dbUpdateDeployIncident(incidentId, { status: 'escalated', resolution: 'no_alert_user' });
      }
      return;
    }

    if (canPersist) {
      await dbUpdateDeployIncident(incidentId, { status: 'investigating' });
    }

    const alertText = buildInvestigationMessage({
      incident: opts.incident,
      target: opts.target,
      baseMessage: opts.message,
    });

    const { agentReply, threadId } = await postToSystemAlertsThread({
      message: alertText,
      emailId: opts.emailId,
      model: RAILWAY_ALERT_MODEL,
      autoRun: serverEnv('AGENT_ALERT_AUTO_RUN') !== '0',
    });

    if (!agentReply) {
      if (canPersist) {
        await dbUpdateDeployIncident(incidentId, { status: 'escalated', resolution: 'no_agent_reply' });
      }
      return;
    }

    const structured = parseDeployOutcome(agentReply);
    const resolved =
      structured === 'resolved' || (structured === 'unknown' && heuristicResolved(agentReply));
    const fixSha = extractFixCommitSha(agentReply);

    if (resolved) {
      if (canPersist) {
        await dbUpdateDeployIncident(incidentId, {
          status: 'resolved',
          agent_reply: agentReply,
          fix_commit_sha: fixSha ?? undefined,
          resolution: structured === 'resolved' ? 'agent_resolved' : 'heuristic_resolved',
        });
      }
      await silentDeleteEmail(opts.emailId);
      log.info('incident resolved', { id: incidentId, repo: opts.target.repo });
      return;
    }

    if (canPersist) {
      await dbUpdateDeployIncident(incidentId, {
        status: fixSha ? 'fixing' : 'escalated',
        agent_reply: agentReply,
        fix_commit_sha: fixSha ?? undefined,
        resolution: fixSha ? 'fix_applied' : 'unresolved',
      });
    }

    if (fixSha && canPersist) {
      scheduleVerifyLoop({
        incidentId,
        target: opts.target,
        fixCommitSha: fixSha,
        emailId: opts.emailId,
      });
    }

    if (opts.pushOnUnresolved !== false) {
      sendPushNotification({
        title: `🚨 Deploy: ${opts.subject?.slice(0, 50) || opts.target.repo}`,
        body: agentReply.slice(0, 200),
        tag: `deploy-incident-${incidentId}`,
        url: threadId
          ? `/admin?tab=chats&chat=${encodeURIComponent(threadId)}`
          : '/admin?tab=chats',
        urgent: true,
      }).catch((e) => log.warn('push failed', e));
    }
  } catch (e) {
    log.error('investigation failed', e);
    if (canPersist) {
      await dbUpdateDeployIncident(incidentId, {
        status: 'escalated',
        resolution: 'investigation_error',
      }).catch(() => undefined);
    }
  }
}

/**
 * Entry point for Railway deploy failures from webhook or email.
 * Returns suppressed:true when another incident already holds the repo lock.
 */
export async function handleDeployFailure(input: DeployFailureInput): Promise<DeployFailureResult> {
  if (!isRailwayIncidentHandlerEnabled()) {
    log.info('incident handler disabled — skipping auto-investigation', {
      source: input.source,
      project: input.project,
      service: input.service,
    });
    return { handled: false, suppressed: false, reason: 'handler_disabled' };
  }

  const target = resolveDeployTarget({
    project: input.project,
    service: input.service,
    subject: input.subject,
    body: input.body,
  });
  const dedupKey = deployDedupKey(target);

  if (!isDeployIncidentsDbConfigured()) {
    log.warn('DATABASE_URL missing — running without repo lock');
    await runInvestigation({
      incident: {
        id: 'no-db',
        dedup_key: dedupKey,
        repo: target.repo,
        project: input.project ?? null,
        service: input.service ?? null,
        environment: input.environment ?? null,
        deployment_id: input.deploymentId ?? null,
        commit_sha: input.commitSha ?? null,
        source: input.source,
        status: 'open',
        email_id: input.emailId ?? null,
        alert_message: input.message,
        agent_reply: null,
        fix_commit_sha: null,
        resolution: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_at: null,
      },
      target,
      message: input.message,
      emailId: input.emailId,
      pushOnUnresolved: input.source === 'email',
      subject: input.subject,
    });
    return { handled: true, suppressed: false, reason: 'no_db_fallback' };
  }

  const acquire = await dbAcquireDeployIncident({
    dedupKey,
    repo: target.repo,
    project: input.project,
    service: input.service,
    environment: input.environment,
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    source: input.source,
    emailId: input.emailId,
    alertMessage: input.message,
  });

  if (!acquire.acquired) {
    if (acquire.reason === 'duplicate') {
      log.info('suppressed duplicate deploy alert', {
        repo: target.repo,
        existingId: acquire.existing.id,
        source: input.source,
      });
      await silentDeleteEmail(input.emailId);
      return {
        handled: true,
        suppressed: true,
        reason: `duplicate_blocked:${target.repo}`,
        incidentId: acquire.existing.id,
      };
    }
    return { handled: false, suppressed: false, reason: 'no_db' };
  }

  const incident = acquire.incident;
  log.info('incident acquired', { id: incident.id, repo: target.repo, source: input.source });

  runInvestigation({
    incident,
    target,
    message: input.message,
    emailId: input.emailId,
    pushOnUnresolved: input.source === 'email',
    subject: input.subject,
  }).catch((e) => log.error('investigation failed', e));

  return {
    handled: true,
    suppressed: false,
    reason: 'investigating',
    incidentId: incident.id,
  };
}
