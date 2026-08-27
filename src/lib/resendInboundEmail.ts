import { Resend } from 'resend';
import { serverEnv } from './serverEnv';

export type ResendInboundEmail = {
  headers: Record<string, string>;
  html?: string;
  text?: string;
};

/** Re-fetch a received message from Resend (headers + body when present). */
export async function fetchResendInboundEmail(resendEmailId: string): Promise<ResendInboundEmail> {
  const apiKey = serverEnv('RESEND_API_KEY')?.trim();
  const id = resendEmailId?.trim();
  if (!apiKey || !id) return { headers: {} };

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.receiving.get(id);
    if (error || !data) return { headers: {} };
    const rec = data as Record<string, unknown>;
    const headers =
      rec.headers && typeof rec.headers === 'object'
        ? Object.fromEntries(
            Object.entries(rec.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : {};
    return {
      headers,
      html: typeof rec.html === 'string' ? rec.html : undefined,
      text: typeof rec.text === 'string' ? rec.text : undefined,
    };
  } catch {
    return { headers: {} };
  }
}

/** Re-fetch stored headers from Resend when the inbox row is missing List-Unsubscribe. */
export async function fetchResendInboundEmailHeaders(
  resendEmailId: string,
): Promise<Record<string, string>> {
  const fetched = await fetchResendInboundEmail(resendEmailId);
  return fetched.headers;
}
