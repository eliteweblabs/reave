/**
 * Open (or continue) a dedicated repair chat when a Railway deploy fails.
 * One Session per service — later failures append here for reference.
 *
 * Auto-repair (agent runs without owner input) is **off by default**.
 * Set DEPLOY_FAILURE_AUTO_REPAIR=1 on Railway to opt in.
 */
import { isAnthropicLlmConfigured } from './anthropicEndpoint';
import { postToSystemAlertsThread } from './systemAlertsThread';
import { formatRailwayLogsSummary, railwayGetLogs } from './railwayAgentApi';
import { createLogger } from './logger';
import { serverEnv } from './serverEnv';
import {
  deployFailureAlertTitle,
  deployFailureServiceName,
} from './agentSituationalContext';

const log = createLogger('deploy-failure-chat');

/** Opt-in only — owner must set DEPLOY_FAILURE_AUTO_REPAIR=1 to auto-run the agent. */
export function isDeployFailureAutoRepairEnabled(): boolean {
  return serverEnv('DEPLOY_FAILURE_AUTO_REPAIR') === '1';
}

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
  /** Default follows DEPLOY_FAILURE_AUTO_REPAIR (off unless explicitly set to 1). */
  autoRun?: boolean;
  /** Log the alert only — skip Railway log fetch (duplicate webhook append). */
  appendOnly?: boolean;
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
  const who = deployFailureServiceName({ service: opts.service, message: opts.baseMessage });
  const lines = [
    `Deploy failed — ${who}`,
    '',
    'GO FIX IT NOW. Do not wait for further instructions. This is the one repair Session for this service — later failures will come back here.',
    '',
    'Railway keeps the previous successful deployment live, so the site is still up.',
    'This is almost always a typo, lockfile mismatch, missing env var, or merge collision.',
    '',
    '1. Read the Railway logs below (and call get_railway_logs if you need more).',
    '2. Fix the root cause in the same turn — write_github_file(branch:"main"), sync the lockfile, or set_railway_variables.',
    '3. Do NOT ask the owner what to do. Do NOT stop at diagnosis.',
    '4. End with exactly one line: ✅ RESOLVED — <reason>   OR   🚨 UNRESOLVED — <what you tried + owner action>',
    '',
    'Docker-image services (calcom-web-app and anything sourced from image:tag, especially :latest): Railway may auto-redeploy when the tag moves — the owner did not push. After TWO failed env-var attempts, stop flipping variables (each set_railway_variables starts another deploy and another webhook). Mark 🚨 UNRESOLVED and tell the owner to pin the image digest. Do not keep "fixing" stale duplicate webhooks.',
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

/** Compact alert when auto-repair is off — log the failure, do not invoke the agent. */
function buildAlertOnlyMessage(baseMessage: string): string {
  return [
    baseMessage.trim(),
    '',
    '(Deploy failure logged. Auto-repair is off — open this Session and send a message when you want the agent to investigate.)',
  ].join('\n');
}

/**
 * Opens or continues the one repair Session for this service.
 * Auto-runs the agent only when DEPLOY_FAILURE_AUTO_REPAIR=1 (and LLM is configured).
 */
export async function openDeployFailureRepairChat(
  input: DeployFailureChatInput,
): Promise<{ threadId?: string; agentReply?: string; reused?: boolean; suppressed?: boolean }> {
  const service = deployFailureServiceName({
    service: input.service,
    message: input.message,
  });
  const reuseTitle = deployFailureAlertTitle(service);
  const wantsAutoRun =
    isDeployFailureAutoRepairEnabled() && input.autoRun !== false;

  const logs = input.appendOnly || !wantsAutoRun
    ? '(Logs not fetched — auto-repair is off or duplicate webhook. Use get_railway_logs in this Session if needed.)'
    : await fetchFailureLogs({
        project: input.project,
        service: input.service || service,
        environment: input.environment,
        deploymentId: input.deploymentId,
      });

  let message = input.appendOnly
    ? [
        `Deploy failure (duplicate webhook) — ${service}`,
        '',
        input.message.trim(),
      ].join('\n')
    : wantsAutoRun
      ? buildRepairPrompt({
          baseMessage: input.message,
          logs,
          playbookExtra: input.playbookExtra,
          service,
        })
      : buildAlertOnlyMessage(input.message);

  const llmReady = isAnthropicLlmConfigured();
  if (wantsAutoRun && !llmReady) {
    message = [
      message,
      '',
      '(Auto-repair skipped — no LLM API key is configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY on Railway, then send a message in this chat to retry.)',
    ].join('\n');
  }

  const result = await postToSystemAlertsThread({
    message,
    autoRun: wantsAutoRun && llmReady,
    emailId: input.emailId,
    model: input.model ?? DEPLOY_FAILURE_REPAIR_MODEL,
    bypassSleep: true,
    reuseTitle,
    repairRun: wantsAutoRun,
    repairService: service,
    // No phone push — build failures stay in the one repair Session.
  });

  log.info('repair chat opened', {
    threadId: result.threadId,
    source: input.source,
    service,
    reused: result.reused,
    suppressed: result.suppressed,
    autoRun: wantsAutoRun && llmReady,
  });

  return result;
}
