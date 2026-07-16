import { postToSystemAlertsThread } from './adminAgentAlert';
import { markDeployFailed } from './deployStatus';
import { markDeployActivity } from './siteMonitoring';
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';

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
    'You run inside this app on Railway. Call check_deployment_status and get_git_status now — report deployed commit vs GitHub latest and health ping. Distinguish rollout teardown vs a real crash. You cannot fetch Railway logs via API; only mention dashboard logs if tools leave the cause unclear.',
  );
  return lines.join('\n');
}

/**
 * Railway project webhook → admin System alerts chat (+ optional push).
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
  if (!ingressKey || ingressKey !== expectedKey.trim()) {
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

  await postToSystemAlertsThread({
    message: text,
    push: {
      title: `Railway: ${svc} deploy failed`,
      body: `${proj} · ${type}`,
      tag: 'railway-deploy-failed',
      url: '/admin?tab=chats',
    },
  });

  return { ok: true, status: 200, message: 'sent' };
}
