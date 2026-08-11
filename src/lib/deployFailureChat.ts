/**
 * Open a dedicated repair chat when a Railway deploy fails.
 * Dumps build/deploy logs and auto-runs the agent — do not wait for the owner.
 */
import { postToSystemAlertsThread } from './systemAlertsThread';
import { formatRailwayLogsSummary, railwayGetLogs } from './railwayAgentApi';
import { createLogger } from './logger';

const log = createLogger('deploy-failure-chat');

/** Same high-tier model the incident handler uses for auto-repair. */
export const DEPLOY_FAILURE_REPAIR_MODEL = 'claude-opus-4-6';

const LOG_LINE_LIMIT = 80;
const LOG_CHAR_BUDGET = 14_000;

export type DeployFailureChatInput = {
  source: 'webhook' | 'email';
  /** Short alert header (project/service/commit). */
  message: string;
  project?: string;
  service?: string;
  environment?: string;
  deploymentId?: string;
  emailId?: string;
  /** Extra playbook lines (incident lock, mandatory markers, etc.). */
  playbookExtra?: string;
  model?: string;
  /** Default true — owner should not need to nudge the agent. */
  autoRun?: boolean;
};

async function fetchFailureLogs(opts: {
  project?: string;
  service?: string;
  environment?: string;
  deploymentId?: string;
}): Promise<string> {
  try {
    const result = await railwayGetLogs({
      project: opts.project,
      service: opts.service,
      environment: opts.environment,
      deployment_id: opts.deploymentId,
      types: ['build', 'deploy'],
      limit: 150,
    });
    if (!result.ok) {
      return `(Could not fetch Railway logs: ${result.error})`;
    }
    let text = formatRailwayLogsSummary(result.streams, LOG_LINE_LIMIT);
    if (text.length > LOG_CHAR_BUDGET) {
      text = `…(truncated)\n${text.slice(-LOG_CHAR_BUDGET)}`;
    }
    return `Deployment: ${result.deployment_id}\n\n${text}`;
  } catch (e) {
    log.warn('log fetch failed', { error: e instanceof Error ? e.message : String(e) });
    return '(Could not fetch Railway logs — call get_railway_logs yourself.)';
  }
}

function buildRepairPrompt(opts: {
  baseMessage: string;
  logs: string;
  playbookExtra?: string;
  service?: string;
}): string {
  const who = opts.service?.trim() || 'service';
  const lines = [
    `Deploy failed — ${who}`,
    '',
    'GO FIX IT NOW. Do not wait for further instructions.',
    '',
    'Railway keeps the previous successful deployment live, so the site is still up.',
    'This is almost always a typo, lockfile mismatch, missing env var, or merge collision.',
    '',
    '1. Read the Railway logs below (and call get_railway_logs if you need more).',
    '2. Fix the root cause in the same turn — write_github_file(branch:"main"), sync the lockfile, or set_railway_variables.',
    '3. Do NOT ask the owner what to do. Do NOT stop at diagnosis.',
    '4. End with exactly one line: ✅ RESOLVED — <reason>   OR   🚨 UNRESOLVED — <what you tried + owner action>',
    '',
    '## Alert',
    opts.baseMessage.trim(),
  ];
  if (opts.playbookExtra?.trim()) {
    lines.push('', opts.playbookExtra.trim());
  }
  lines.push('', '## Railway logs', opts.logs.trim());
  return lines.join('\n');
}

/**
 * Creates a new System alerts chat with failure context + Railway logs,
 * then auto-runs the agent to repair (unless autoRun is false).
 */
export async function openDeployFailureRepairChat(
  input: DeployFailureChatInput,
): Promise<{ threadId?: string; agentReply?: string }> {
  const logs = await fetchFailureLogs({
    project: input.project,
    service: input.service,
    environment: input.environment,
    deploymentId: input.deploymentId,
  });

  const message = buildRepairPrompt({
    baseMessage: input.message,
    logs,
    playbookExtra: input.playbookExtra,
    service: input.service,
  });

  const result = await postToSystemAlertsThread({
    message,
    autoRun: input.autoRun !== false,
    emailId: input.emailId,
    model: input.model ?? DEPLOY_FAILURE_REPAIR_MODEL,
    bypassSleep: true,
    // No phone push — build failures open a chat; owner reviews async.
  });

  log.info('repair chat opened', {
    threadId: result.threadId,
    source: input.source,
    service: input.service,
    autoRun: input.autoRun !== false,
  });

  return result;
}
