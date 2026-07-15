/**
 * Outbound client messaging — send email (Resend) and SMS (Telnyx).
 * Used to deliver client portal links to clients on their own device.
 */
import { resolveEmailFrom } from './companyConfig';
import { serverEnv } from './serverEnv';
import { sendTelnyxSms } from './telnyxClient';

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export function isEmailSendConfigured(): boolean {
  return Boolean(serverEnv('RESEND_API_KEY'));
}

export function isSmsSendConfigured(): boolean {
  return Boolean(serverEnv('TELNYX_API_KEY') && serverEnv('TELNYX_FROM_NUMBER'));
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const to = opts.to.trim();
  if (!to) return { ok: false, error: 'recipient email is required' };

  const from = opts.from?.trim() || (await resolveEmailFrom());
  if (!from) {
    return { ok: false, error: 'Set RESEND_FROM or configure company outbound email in admin profile' };
  }

  const normalizeList = (raw?: string | string[]): string[] | undefined => {
    if (!raw) return undefined;
    const items = (Array.isArray(raw) ? raw : raw.split(/[,;]+/))
      .map((v) => v.trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  };

  const cc = normalizeList(opts.cc);
  const bcc = normalizeList(opts.bcc);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        ...(opts.headers && Object.keys(opts.headers).length ? { headers: opts.headers } : {}),
      }),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'message' in json
          ? String((json as { message: unknown }).message)
          : text.slice(0, 200) || res.statusText;
      return { ok: false, error: err };
    }
    const id = json && typeof json === 'object' && 'id' in json ? String((json as { id: unknown }).id) : undefined;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendSms(opts: { to: string; body: string }): Promise<SendResult> {
  return sendTelnyxSms({ to: opts.to, text: opts.body });
}
