/**
 * Map Resend API / webhook delivery signals to outbound log status.
 */

export type OutboundDeliveryStatus = 'pending' | 'delivered' | 'bounced' | 'complained';

export function normalizeResendLastEventToDelivery(
  lastEvent?: string | null,
): OutboundDeliveryStatus | null {
  const s = String(lastEvent || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === 'delivered') return 'delivered';
  if (s === 'bounced') return 'bounced';
  if (s === 'complained') return 'complained';
  if (s === 'sent' || s === 'queued' || s === 'delivery_delayed') return 'pending';
  return null;
}
