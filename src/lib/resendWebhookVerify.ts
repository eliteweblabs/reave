import { Resend } from 'resend';
import { serverEnv } from './serverEnv';

export function resendWebhookSecrets(): string[] {
  const primary = serverEnv('RESEND_WEBHOOK_SECRET')?.trim() || '';
  const tx = serverEnv('RESEND_TX_WEBHOOK_SECRET')?.trim() || '';
  const out = [...new Set([tx, primary].filter(Boolean))];
  return out;
}

export function verifyResendWebhookEvent(
  resend: Resend,
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
): { type: string; data: unknown } {
  const secrets = resendWebhookSecrets();
  if (!secrets.length) {
    throw new Error('RESEND_WEBHOOK_SECRET not configured');
  }
  let lastError: unknown;
  for (const webhookSecret of secrets) {
    try {
      return resend.webhooks.verify({
        payload,
        headers,
        webhookSecret,
      }) as { type: string; data: unknown };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('invalid signature');
}
