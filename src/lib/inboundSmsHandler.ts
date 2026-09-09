/**
 * Inbound SMS triage pipeline.
 *
 * Flow: sender allowlist → email forward (optional) → admin System alerts → (optional) Claude auto-reply.
 *
 * Env vars:
 *   SMS_ALLOWED_SENDERS   — comma-separated phone numbers (E.164). If empty, all pass.
 *   SMS_NOTIFY_EMAIL      — forward inbound SMS to this address via Resend (needs RESEND_API_KEY).
 *   SMS_AI_REPLY_ENABLED  — set to "1" to have Claude auto-reply to every SMS.
 */
import { serverEnv } from './serverEnv';
import { postToSystemAlertsThread, agentAlertUserId } from './adminAgentAlert';
import { isEmailSendConfigured, sendEmail } from './outbound';
import { sendTelnyxSms } from './telnyxClient';
import { isSleepModeActive } from './pushQuietHours';
import { createAnthropicMessage } from './anthropicMessages';
import { resolveAnthropicApiKey } from './anthropicEndpoint';

export interface InboundSms {
  from: string;
  to: string;
  text: string;
  messageId?: string;
}

export interface InboundSmsResult {
  ok: boolean;
  /** "notified" | "emailed" | "replied" | "rejected" | "no-target" | "sleep_deferred" */
  action: string;
  from: string;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedSender(from: string): boolean {
  const allowed = parseList(serverEnv('SMS_ALLOWED_SENDERS'));
  if (allowed.length === 0) return true;
  return allowed.includes(from.replace(/\s/g, ''));
}

function formatSmsAlert(sms: InboundSms): string {
  const lines = [
    'Inbound SMS received.',
    `From: ${sms.from}`,
    `To: ${sms.to}`,
    '',
    sms.text.length > 600 ? `${sms.text.slice(0, 600)}…` : sms.text,
    '',
    'Summarize and suggest whether to reply.',
  ];
  return lines.join('\n');
}

function formatSmsEmail(sms: InboundSms, receivedAt: string): { subject: string; text: string } {
  const toLine = sms.to || serverEnv('TELNYX_FROM_NUMBER')?.trim() || 'your number';
  const subject = `SMS from ${sms.from}: ${toLine}`;
  const text = [
    `From: ${sms.from}`,
    `To: ${toLine}`,
    `Received: ${receivedAt}`,
    '',
    sms.text,
    '',
    `Reply by texting ${toLine} directly, or open admin → Chats to respond from the dashboard.`,
  ].join('\n');
  return { subject, text };
}

async function forwardSmsToEmail(sms: InboundSms): Promise<boolean> {
  const to = serverEnv('SMS_NOTIFY_EMAIL')?.trim();
  if (!to) return false;
  if (!isEmailSendConfigured()) {
    console.warn('[sms] SMS_NOTIFY_EMAIL set but RESEND_API_KEY is missing');
    return false;
  }

  const receivedAt = new Date().toISOString();
  const { subject, text } = formatSmsEmail(sms, receivedAt);
  const result = await sendEmail({ to, subject, text });
  if (!result.ok) {
    console.error('[sms] email forward failed', result.error);
    return false;
  }
  console.info('[sms] email forward sent', { to, from: sms.from });
  return true;
}

async function aiReply(sms: InboundSms): Promise<string | null> {
  if (!resolveAnthropicApiKey()?.trim()) return null;

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';

  try {
    const result = await createAnthropicMessage({
      model,
      max_tokens: 200,
      system:
        'You are a concise SMS assistant. Reply in 1–2 sentences max. No markdown, no lists. If you cannot help with the request, politely say so and suggest they call or email.',
      messages: [{ role: 'user', content: sms.text }],
    });
    if (!result.ok) return null;
    const block = (result.data.content as Array<{ type: string; text: string }> | undefined)?.find(
      (b) => b.type === 'text',
    );
    return block?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function handleInboundSms(sms: InboundSms): Promise<InboundSmsResult> {
  const { from } = sms;

  if (await isSleepModeActive()) {
    console.info('[sms] deferred during sleep mode', { from });
    return { ok: true, action: 'sleep_deferred', from };
  }

  if (!isAllowedSender(from)) {
    console.warn('[sms] rejected sender', { from });
    return { ok: true, action: 'rejected', from };
  }

  const emailed = await forwardSmsToEmail(sms);

  if (agentAlertUserId()) {
    await postToSystemAlertsThread({
      message: formatSmsAlert(sms),
      autoRun: false,
      push: {
        title: `SMS from ${from}`,
        body: sms.text.slice(0, 120),
        tag: `sms-${from}`,
        url: '/admin?tab=chats',
      },
    });
    console.info('[sms] posted to System alerts', { from });
  } else if (!serverEnv('SMS_NOTIFY_EMAIL')?.trim()) {
    console.warn('[sms] AGENT_ALERT_USER_ID and SMS_NOTIFY_EMAIL not set — no inbound target');
  }

  const aiEnabled = serverEnv('SMS_AI_REPLY_ENABLED') === '1';
  if (aiEnabled) {
    const reply = await aiReply(sms);
    if (reply) {
      const r = await sendTelnyxSms({ to: from, text: reply });
      if (r.ok) {
        console.info('[sms] AI auto-reply sent', { to: from });
        return { ok: true, action: 'replied', from };
      }
      console.error('[sms] AI auto-reply failed', r.error);
    }
  }

  if (agentAlertUserId()) {
    return { ok: true, action: 'notified', from };
  }
  if (emailed) {
    return { ok: true, action: 'emailed', from };
  }
  return { ok: true, action: 'no-target', from };
}
