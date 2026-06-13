/**
 * Outbound client messaging — send email (Resend) and SMS (Twilio).
 * Used to deliver client portal links to clients on their own device.
 */
import { serverEnv } from './serverEnv';

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export function isEmailSendConfigured(): boolean {
  return Boolean(serverEnv('RESEND_API_KEY'));
}

export function isSmsSendConfigured(): boolean {
  return Boolean(serverEnv('TWILIO_ACCOUNT_SID') && serverEnv('TWILIO_AUTH_TOKEN'));
}

/** Default verified sender; override with RESEND_FROM (e.g. "Reave <hi@reave.app>"). */
function emailFrom(): string {
  return serverEnv('RESEND_FROM')?.trim() || 'Reave <noreply@reave.app>';
}

/** Default Twilio sender number; override with TWILIO_FROM_NUMBER. */
function smsFrom(): string {
  return serverEnv('TWILIO_FROM_NUMBER')?.trim() || '+18889498224';
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const to = opts.to.trim();
  if (!to) return { ok: false, error: 'recipient email is required' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailFrom(),
        to: [to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
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
  const sid = serverEnv('TWILIO_ACCOUNT_SID')?.trim();
  const tok = serverEnv('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !tok) return { ok: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set' };
  const to = opts.to.trim();
  if (!to) return { ok: false, error: 'recipient phone is required' };

  try {
    const auth = Buffer.from(`${sid}:${tok}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: smsFrom(), Body: opts.body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
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
    const id = json && typeof json === 'object' && 'sid' in json ? String((json as { sid: unknown }).sid) : undefined;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
