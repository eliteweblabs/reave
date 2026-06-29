/**
 * Inbound SMS triage pipeline.
 *
 * Flow: sender allowlist → admin System alerts thread → (optional) Claude auto-reply.
 *
 * Env vars:
 *   SMS_ALLOWED_SENDERS   — comma-separated phone numbers (E.164). If empty, all pass.
 *   SMS_AI_REPLY_ENABLED  — set to "1" to have Claude auto-reply to every SMS.
 */
import { serverEnv } from './serverEnv';
import { postToSystemAlertsThread, agentAlertUserId } from './adminAgentAlert';
import { sendTelnyxSms } from './telnyxClient';

export interface InboundSms {
  from: string;
  to: string;
  text: string;
  messageId?: string;
}

export interface InboundSmsResult {
  ok: boolean;
  /** "notified" | "replied" | "rejected" | "no-target" */
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

async function aiReply(sms: InboundSms): Promise<string | null> {
  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) return null;

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        system:
          'You are a concise SMS assistant. Reply in 1–2 sentences max. No markdown, no lists. If you cannot help with the request, politely say so and suggest they call or email.',
        messages: [{ role: 'user', content: sms.text }],
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    const block = j.content?.find((b) => b.type === 'text');
    return block?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function handleInboundSms(sms: InboundSms): Promise<InboundSmsResult> {
  const { from } = sms;

  if (!isAllowedSender(from)) {
    console.warn('[sms] rejected sender', { from });
    return { ok: true, action: 'rejected', from };
  }

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
  } else {
    console.warn('[sms] AGENT_ALERT_USER_ID not set — alert skipped');
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

  return { ok: true, action: agentAlertUserId() ? 'notified' : 'no-target', from };
}
