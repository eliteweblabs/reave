import { handleDeployFailure, isRailwayIncidentHandlerEnabled } from './deployIncidentHandler';
import { clearDeployStarted, markDeployFailed, markDeployStarted } from './deployStatus';
import { markDeployActivity } from './siteMonitoring';
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';
import { secretMatches } from './secretCompare';

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

function isDeployStartEvent(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes('deployment.building') ||
    t.includes('deployment.deploying') ||
    t.includes('deployment.initializing') ||
    t.includes('deployment.queued')
  );
}

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
    'Auto-repair chat will open with Railway logs — agent should fix without waiting.',
  );
  return lines.join('\n');
}

/**
 * Railway project webhook → admin repair chat + deploy indicator.
 *
 * Deploy failures always open a new chat with Railway logs and auto-run the
 * agent to fix (typos / lockfile / collisions). Full incident lock + verify
 * loop runs when RAILWAY_INCIDENT_HANDLER=1. No phone push for build failures.
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
  if (!secretMatches(ingressKey, expectedKey)) {
    return { ok: false, status: 401, message: 'invalid key' };
  }

  let body: RailwayWebhookBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as RailwayWebhookBody) : {};
  } catch {
    return { ok: false, status: 400, message: 'invalid json' };
  }

  const type = body.type ?? '';

  if (isDeployStartEvent(type)) {
    await markDeployStarted({
      commitHash:
        typeof body.details?.commitHash === 'string' ? body.details.commitHash : null,
      commitMessage:
        typeof body.details?.commitMessage === 'string' ? body.details.commitMessage : null,
      timestamp: body.timestamp ?? null,
    });
    return { ok: true, status: 200, message: 'deploy started — indicator updated' };
  }

  if (isDeploySuccessEvent(type)) {
    await clearDeployStarted();
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
  const env = body.resource?.environment?.name ?? undefined;
  const deploymentId =
    body.resource?.deployment?.id ??
    (typeof body.details?.id === 'string' ? body.details.id : undefined);
  const failedSha =
    typeof body.details?.commitHash === 'string' ? body.details.commitHash : null;
  await markDeployFailed(`Deploy failed — ${svc} (${proj})`, failedSha);

  const text = formatRailwayDeployAlert(body);
  if (!serverEnv('AGENT_ALERT_USER_ID')?.trim()) {
    console.warn('[railway-webhook] deploy failure but AGENT_ALERT_USER_ID missing');
    return { ok: true, status: 200, message: 'no alert target' };
  }

  // Full incident handler: repo lock + verify loop (also opens the repair chat).
  if (isRailwayIncidentHandlerEnabled()) {
    const result = await handleDeployFailure({
      source: 'webhook',
      message: text,
      project: body.resource?.project?.name,
      service: body.resource?.service?.name,
      environment: body.resource?.environment?.name,
      deploymentId,
      commitSha: failedSha ?? undefined,
    });

    const msg = result.suppressed
      ? `suppressed:${result.reason}`
      : result.handled
        ? `incident:${result.incidentId ?? result.reason}`
        : 'failed';

    return { ok: true, status: 200, message: msg };
  }

  // Always open a repair chat with logs and auto-fix — even when the
  // heavier incident lock/verify loop is off.
  const { openDeployFailureRepairChat } = await import('./deployFailureChat');
  const opened = await openDeployFailureRepairChat({
    source: 'webhook',
    message: text,
    project: body.resource?.project?.name,
    service: body.resource?.service?.name,
    environment: env,
    deploymentId,
    autoRun: true,
  });

  return {
    ok: true,
    status: 200,
    message: opened.threadId ? `repair_chat:${opened.threadId}` : 'repair_chat_failed',
  };
}
