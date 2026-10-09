/** Cal.com App table slug for Stripe (dirName stripepayment). */
export const CAL_STRIPE_APP_SLUG = 'stripe';

export type CalcomStripePaymentOption = 'ON_BOOKING' | 'HOLD';

/** EventType.metadata for paid barber services (self-hosted Cal.com + Stripe app). */
export function calcomStripeEventMetadata(
  price: number,
  currency = 'usd',
  paymentOption: CalcomStripePaymentOption = 'ON_BOOKING',
): Record<string, unknown> {
  const stripeApp = {
    enabled: true,
    price,
    currency,
    paymentOption,
  };
  return {
    price,
    currency,
    apps: {
      [CAL_STRIPE_APP_SLUG]: stripeApp,
    },
  };
}
