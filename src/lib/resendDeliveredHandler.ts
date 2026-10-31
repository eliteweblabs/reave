/**
 * Process Resend email.delivered — mark outbound log when recipient MTA accepts the message.
 */

import { markOutboundEmailDelivered } from './projectOutboundEmail';

export type ResendDeliveredEvent = {
  type: 'email.delivered';
  data: {
    email_id?: string;
    created_at?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
  };
};

export type DeliveredHandlerResult = {
  action: 'marked' | 'not_found' | 'ignored' | 'error';
  resendId?: string;
  error?: string;
};

function parseDeliveredAt(raw?: string): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export async function handleResendDeliveredEvent(
  event: ResendDeliveredEvent,
): Promise<DeliveredHandlerResult> {
  const resendId = event.data.email_id?.trim() || '';
  if (!resendId) {
    return { action: 'error', error: 'No email_id in delivered event' };
  }

  const deliveredAt = parseDeliveredAt(event.data.created_at) ?? new Date().toISOString();
  const updated = await markOutboundEmailDelivered(resendId, deliveredAt);
  if (!updated) {
    return { action: 'not_found', resendId };
  }
  return { action: 'marked', resendId };
}
