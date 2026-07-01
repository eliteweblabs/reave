/**
 * US carrier email-to-SMS gateways (phone_number@gateway_domain).
 * Ported from astro-supabase-main — used when Telnyx isn't configured.
 */

export type CarrierInfo = {
  name: string;
  gateway: string;
  format: string;
};

export const SMS_CARRIERS: Record<string, CarrierInfo> = {
  att: {
    name: 'AT&T',
    gateway: '@txt.att.net',
    format: '1234567890@txt.att.net',
  },
  verizon: {
    name: 'Verizon / Spectrum',
    gateway: '@vtext.com',
    format: '1234567890@vtext.com',
  },
  tmobile: {
    name: 'T-Mobile',
    gateway: '@tmomail.net',
    format: '1234567890@tmomail.net',
  },
  sprint: {
    name: 'Sprint',
    gateway: '@messaging.sprintpcs.com',
    format: '1234567890@messaging.sprintpcs.com',
  },
  boost: {
    name: 'Boost Mobile',
    gateway: '@smsmyboostmobile.com',
    format: '1234567890@smsmyboostmobile.com',
  },
  cricket: {
    name: 'Cricket Wireless',
    gateway: '@sms.cricketwireless.net',
    format: '1234567890@sms.cricketwireless.net',
  },
  metropcs: {
    name: 'MetroPCS',
    gateway: '@mymetropcs.com',
    format: '1234567890@mymetropcs.com',
  },
  uscellular: {
    name: 'U.S. Cellular',
    gateway: '@email.uscc.net',
    format: '1234567890@email.uscc.net',
  },
  virgin: {
    name: 'Virgin Mobile',
    gateway: '@vmobl.com',
    format: '1234567890@vmobl.com',
  },
};

export function getCarrierInfo(carrierKey: string): CarrierInfo | null {
  return SMS_CARRIERS[carrierKey] ?? null;
}

export function isValidCarrier(carrierKey: string): boolean {
  return carrierKey in SMS_CARRIERS;
}

export function getCarrierKeyFromGateway(gateway: string): string | null {
  const g = gateway.startsWith('@') ? gateway : `@${gateway}`;
  for (const [key, carrier] of Object.entries(SMS_CARRIERS)) {
    if (carrier.gateway === g) return key;
  }
  return null;
}

/** Normalize to 10-digit US number or null. */
export function cleanUsPhone(phoneNumber: string): string | null {
  const cleaned = phoneNumber.replace(/\D/g, '');
  if (cleaned.length === 10) return cleaned;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.slice(1);
  return null;
}

/** Build carrier gateway address, e.g. 5551234567@txt.att.net */
export function generateSmsEmail(phoneNumber: string, carrierKey: string): string | null {
  const carrier = getCarrierInfo(carrierKey);
  if (!carrier?.gateway) return null;
  const cleanPhone = cleanUsPhone(phoneNumber);
  if (!cleanPhone) return null;
  return `${cleanPhone}${carrier.gateway}`;
}

export const SMS_CARRIER_OPTIONS = Object.entries(SMS_CARRIERS).map(([id, carrier]) => ({
  id,
  name: carrier.name,
}));
