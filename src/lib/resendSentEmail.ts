/**
 * Fetch a sent transactional email from Resend (html + text).
 */
import { serverEnv } from './serverEnv';

export type ResendSentEmailContent = {
  html?: string;
  text?: string;
  subject?: string;
};

export async function fetchResendSentEmail(resendId: string): Promise<ResendSentEmailContent | null> {
  const key = serverEnv('RESEND_API_KEY')?.trim();
  const id = resendId.trim();
  if (!key || !id) return null;

  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return null;
    const rec = json as Record<string, unknown>;
    return {
      html: typeof rec.html === 'string' ? rec.html : undefined,
      text: typeof rec.text === 'string' ? rec.text : undefined,
      subject: typeof rec.subject === 'string' ? rec.subject : undefined,
    };
  } catch {
    return null;
  }
}
