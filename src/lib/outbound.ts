/**
 * Outbound client messaging — send email (Resend), SMS (Telnyx), and
 * email-to-SMS via carrier gateways (Resend → 5551234567@txt.att.net).
 */
import { resolveEmailFrom } from './companyConfig';
import { serverEnv } from './serverEnv';
import { sendTelnyxSms } from './telnyxClient';
import {
  generateSmsEmail,
  getCarrierInfo,
  getCarrierKeyFromGateway,
  isValidCarrier,
} from './smsUtils';

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export function isEmailSendConfigured(): boolean {
  return Boolean(serverEnv('RESEND_API_KEY'));
}

export function isSmsSendConfigured(): boolean {
  return Boolean(serverEnv('TELNYX_API_KEY') && serverEnv('TELNYX_FROM_NUMBER'));
}

/** Email-to-SMS works whenever Resend is configured (no Telnyx needed). */
export function isEmailToSmsConfigured(): boolean {
  return isEmailSendConfigured();
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

  const from = await resolveEmailFrom();
  if (!from) {
    return { ok: false, error: 'Set RESEND_FROM or configure company outbound email in admin profile' };
  }

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

/**
 * Send SMS by emailing the carrier gateway (e.g. 5551234567@txt.att.net).
 * carrier: carrier key (`att`) or gateway domain (`@txt.att.net`).
 */
export async function sendSmsViaEmailGateway(opts: {
  phone: string;
  carrier: string;
  text: string;
  subject?: string;
}): Promise<SendResult & { gatewayEmail?: string }> {
  if (!isEmailSendConfigured()) {
    return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
  }

  let carrierKey = opts.carrier.trim();
  if (carrierKey.startsWith('@')) {
    carrierKey = getCarrierKeyFromGateway(carrierKey) ?? carrierKey;
  }
  if (!isValidCarrier(carrierKey)) {
    return { ok: false, error: 'Select a valid mobile carrier.' };
  }

  const gatewayEmail = generateSmsEmail(opts.phone, carrierKey);
  if (!gatewayEmail) {
    return { ok: false, error: 'Invalid US phone number for SMS gateway.' };
  }

  let text = opts.text.trim();
  if (text.length > 160) text = `${text.slice(0, 157)}...`;

  const carrierName = getCarrierInfo(carrierKey)?.name ?? 'SMS';
  const subject = opts.subject?.trim() || `Message via ${carrierName}`;

  const r = await sendEmail({ to: gatewayEmail, subject, text });
  if (!r.ok) return r;
  return { ...r, gatewayEmail };
}
