import { postToSystemAlertsThread } from './adminAgentAlert';
import { markDeployFailed } from './deployStatus';
import { markDeployActivity } from './siteMonitoring';
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';
import { secureCompareStrings } from './secureCompare';

/**
 * The model used for autonomous Railway failure investigation.
 * Chosen at the highest reliably-available tier so the agent can read logs,
 * run check_deployment_status / get_git_status, and attempt self-repair
 * without any phone notification interrupting the owner.
 */
const RAILWAY_ALERT_MODEL = 'claude-opus-4-6';

type RailwayWebhookBody = {
  type?: string;
  severity?: string;
  details?: Record<string, unknown>;
  resource?: {
    project?: { id?: string; name?: string };
    environment?: { id?: string; name?: string };
    service?: { id?: string; name?: string };
    deployment?: { id?: string };
  };
  timestamp?: string;
};

function isDeployFailureEvent(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes('deployment.failed') ||
    t.includes('deploy.failed') ||
    t === 'deployment.failed' ||
    t.includes('deployment.crashed') ||
    t.includes('service.crashed')
  );
}

function isDeploySuccessEvent(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes('deployment.success') ||
    t.includes('deploy.success') ||
    t === 'deployment.success' ||
    (t.includes('deploy') && t.includes('success'))
  );
}

function formatRailwayDeployAlert(body: RailwayWebhookBody): string {
  const svc = body.resource?.service?.name ?? '?';
  const proj = body.resource?.project?.name ?? '?';
  const env = body.resource?.environment?.name ?? '?';
  const depId = body.resource?.deployment?.id ?? body.details?.id;
  const branch = body.details?.branch;
  const commit = body.details?.commitMessage;
  const lines = [
    `Railway deploy failure: ${body.type ?? 'event'}`,
    `Project: ${proj}`,
    `Service: ${svc}`,
    `Environment: ${env}`,
  ];
  if (depId) lines.push(`Deployment: ${depId}`);
  if (typeof branch === 'string') lines.push(`Branch: ${branch}`);
  if (typeof commit === 'string') lines.push(`Commit: ${String(commit).slice(0, 120)}`);
  if (body.timestamp) lines.push(`Time: ${body.timestamp}`);
  lines.push(
    '',
    'AUTONOMOUS INVESTIGATION REQUIRED — no phone notification was sent. You run inside this app on Railway.',
    'Steps: call check_deployment_status and get_git_status now. Report deployed commit vs GitHub latest and health ping.',
    'Distinguish rollout teardown (normal) vs a real crash (needs repair).',
    'If it is a real crash: read the relevant source files, identify the error, write and commit a fix via write_github_file to main.',
    'You cannot fetch Railway logs via API — only mention dashboard logs if your tools cannot explain the failure.',
    'Summarize findings and any fix applied clearly so the owner can review in System alerts.',
  );
  return lines.join('\n');
}

/**
 * Railway project webhook → admin System alerts chat.
 *
 * Deploy failures are investigated silently by the highest-tier model
 * (RAILWAY_ALERT_MODEL). NO push notification is sent — the owner should
 * never be buzzed on their phone for a build failure. Results land in the
 * System alerts chat thread for async review.
 */
export async function handleRailwayWebhook(opts: {
  ingressKey: string | null;
  expectedKey: string | undefined;
  rawBody: string;
}): Promise<{ ok: boolean; status: number; message: string }> {
  const { ingressKey, expectedKey, rawBody } = opts;

  if (!expectedKey?.trim()) {
    return { ok: false, status: 503, message: 'RAILWAY_WEBHOOK_INGRESS_KEY not configured' };
  }
  if (!ingressKey || !secureCompareStrings(ingressKey, expectedKey.trim())) {
    return { ok: false, status: 401, message: 'invalid key' };
  }

  let body: RailwayWebhookBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as RailwayWebhookBody) : {};
  } catch {
    return { ok: false, status: 400, message: 'invalid json' };
  }

  const type = body.type ?? '';

  if (isDeploySuccessEvent(type)) {
    if (hasFeature('site_monitoring')) {
      markDeployActivity();
    }
    return { ok: true, status: 200, message: 'deploy success — monitoring suppress window started' };
  }

  if (!isDeployFailureEvent(type)) {
    return { ok: true, status: 200, message: 'ignored' };
  }

  const svc = body.resource?.service?.name ?? 'service';
  const proj = body.resource?.project?.name ?? 'project';
  markDeployFailed(`Deploy failed — ${svc} (${proj})`);

  const text = formatRailwayDeployAlert(body);
  if (!serverEnv('AGENT_ALERT_USER_ID')?.trim()) {
    console.warn('[railway-webhook] deploy failure but AGENT_ALERT_USER_ID missing');
    return { ok: true, status: 200, message: 'no alert target' };
  }

  // Post to System alerts with the best model available for auto-investigation.
  // Intentionally NO push — the agent investigates silently in the background.
  await postToSystemAlertsThread({
    message: text,
    model: RAILWAY_ALERT_MODEL,
    // push: omitted — owner is never buzzed for Railway deploy failures
  });

  return { ok: true, status: 200, message: 'sent' };
}
