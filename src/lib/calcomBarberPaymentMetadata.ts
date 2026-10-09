/** Cal.com App table slug for Stripe (dirName stripepayment). */
export const CAL_STRIPE_APP_SLUG = 'stripe';

export type CalcomStripePaymentOption = 'ON_BOOKING' | 'HOLD';

/** Barber config JSON uses whole USD; Cal EventType.price + Stripe metadata use cents. */
export function barberConfigPriceToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

/** EventType.metadata for paid barber services (self-hosted Cal.com + Stripe app). */
export function calcomStripeEventMetadata(
  /** Price in cents (USD). */
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
