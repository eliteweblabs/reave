import { telegramSendMessage } from './telegramClient';
import { markDeployFailed } from './deployStatus';
import { syncDeployStatusPin } from './telegramDeployPin';
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

function formatRailwayDeployAlert(body: RailwayWebhookBody): string {
  const svc = body.resource?.service?.name ?? '?';
  const proj = body.resource?.project?.name ?? '?';
  const env = body.resource?.environment?.name ?? '?';
  const depId = body.resource?.deployment?.id ?? body.details?.id;
  const branch = body.details?.branch;
  const commit = body.details?.commitMessage;
  const lines = [
    `Railway: ${body.type ?? 'event'}`,
    `Project: ${proj}`,
    `Service: ${svc}`,
    `Environment: ${env}`,
  ];
  if (depId) lines.push(`Deployment: ${depId}`);
  if (typeof branch === 'string') lines.push(`Branch: ${branch}`);
  if (typeof commit === 'string') lines.push(`Commit: ${String(commit).slice(0, 120)}`);
  if (body.timestamp) lines.push(`Time: ${body.timestamp}`);
  return lines.join('\n');
}

/**
 * Railway project webhook → optional Telegram alert (deploy failures).
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
  const token = serverEnv('TELEGRAM_BOT_TOKEN')?.trim();
  const chatRaw = serverEnv('TELEGRAM_DEPLOY_NOTIFY_CHAT_ID')?.trim();
  const chatId = chatRaw ? Number(chatRaw) : NaN;

  if (!isDeployFailureEvent(type)) {
    return { ok: true, status: 200, message: 'ignored' };
  }

  if (!token || !Number.isFinite(chatId)) {
    console.warn('[railway-webhook] deploy failure but TELEGRAM_BOT_TOKEN or TELEGRAM_DEPLOY_NOTIFY_CHAT_ID missing');
    return { ok: true, status: 200, message: 'no telegram target' };
  }

  const text = formatRailwayDeployAlert(body);
  const svc = body.resource?.service?.name ?? 'service';
  const proj = body.resource?.project?.name ?? 'project';
  markDeployFailed(`Deploy failed — ${svc} (${proj})`);
  await telegramSendMessage(token, chatId, text);
  syncDeployStatusPin(token).catch((e) => {
    console.warn('[railway-webhook] deploy pin sync failed:', e instanceof Error ? e.message : e);
  });
  return { ok: true, status: 200, message: 'sent' };
}
