import { serverEnv } from './serverEnv';
import { telegramSendMessage } from './telegramClient';
import { classifyEmail, type InboundEmail } from './emailRules';

export interface InboundEmailResult {
  ok: boolean;
  /** "notified" | "classified" | "rejected" | "no-target" */
  action: string;
  status: string;
  from: string;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function senderDomain(from: string): string {
  const at = from.lastIndexOf('@');
  return at >= 0 ? from.slice(at + 1).toLowerCase() : '';
}

/**
 * Optional sender allowlist. If neither EMAIL_ALLOWED_SENDERS nor
 * EMAIL_ALLOWED_DOMAINS is configured, all senders are accepted (content is
 * only ever surfaced to Telegram, never executed or fed to an LLM).
 */
function isAllowedSender(from: string): boolean {
  const senders = parseList(serverEnv('EMAIL_ALLOWED_SENDERS'));
  const domains = parseList(serverEnv('EMAIL_ALLOWED_DOMAINS'));
  if (senders.length === 0 && domains.length === 0) return true;
  const addr = from.toLowerCase();
  if (senders.includes(addr)) return true;
  return domains.includes(senderDomain(addr));
}

function snippet(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function formatEmailAlert(email: InboundEmail, status: string): string {
  const lines = [
    `📬 Email [${status}]`,
    `From: ${email.from || '(unknown)'}`,
    `Subject: ${email.subject || '(no subject)'}`,
  ];
  const body = snippet(email.text);
  if (body) lines.push('', body);
  return lines.join('\n');
}

/**
 * Run an inbound email through the triage pipeline:
 * sender allowlist → classify → (optionally) notify the Telegram bot.
 */
export async function handleInboundEmail(email: InboundEmail): Promise<InboundEmailResult> {
  const from = email.from ?? '';

  if (!isAllowedSender(from)) {
    console.warn('[email] rejected sender', { from, subject: email.subject });
    return { ok: true, action: 'rejected', status: 'REJECTED', from };
  }

  const { status, notify } = classifyEmail(email);
  console.info('[email] classified', { from, subject: email.subject, status, notify });

  if (!notify) {
    return { ok: true, action: 'classified', status, from };
  }

  const token = serverEnv('TELEGRAM_BOT_TOKEN')?.trim();
  const chatRaw =
    serverEnv('EMAIL_NOTIFY_CHAT_ID')?.trim() ||
    serverEnv('TELEGRAM_DEPLOY_NOTIFY_CHAT_ID')?.trim();
  const chatId = chatRaw ? Number(chatRaw) : NaN;

  if (!token || !Number.isFinite(chatId)) {
    console.warn('[email] notify wanted but TELEGRAM_BOT_TOKEN or EMAIL_NOTIFY_CHAT_ID missing');
    return { ok: true, action: 'no-target', status, from };
  }

  await telegramSendMessage(token, chatId, formatEmailAlert(email, status));
  return { ok: true, action: 'notified', status, from };
}
