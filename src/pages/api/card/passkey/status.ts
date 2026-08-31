import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { storeHasCardPasskeys } from '../../../../lib/cardPasskeyStore';
import { readCardPasskeyTrust } from '../../../../lib/cardPasskeyTrust';
import { isPgConfigured } from '../../../../lib/pgPool';

export const prerender = false;

/** Whether passkey gating is active and if this device is already trusted. */
export const GET: APIRoute = async ({ request }) => {
  const hasPasskeys = isPgConfigured() ? await storeHasCardPasskeys() : false;
  const trust = readCardPasskeyTrust(request);
  return jsonResponse({
    ok: true,
    hasPasskeys,
    passkeyGating: hasPasskeys,
    trusted: trust
      ? { userId: trust.userId, displayName: trust.displayName || 'You' }
      : null,
  });
};
