import { Resend } from 'resend';
import { serverEnv } from './serverEnv';

/** Re-fetch stored headers from Resend when the inbox row is missing List-Unsubscribe. */
export async function fetchResendInboundEmailHeaders(
  resendEmailId: string,
): Promise<Record<string, string>> {
  const apiKey = serverEnv('RESEND_API_KEY')?.trim();
  const id = resendEmailId?.trim();
  if (!apiKey || !id) return {};

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.receiving.get(id);
    if (error || !data?.headers || typeof data.headers !== 'object') return {};
    return Object.fromEntries(
      Object.entries(data.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  } catch {
    return {};
  }
}
