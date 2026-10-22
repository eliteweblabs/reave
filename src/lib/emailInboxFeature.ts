import { hasEmailInbox } from './features';
import { jsonResponse } from './apiResponse';

/** Block admin/API mail surfaces when the inbox add-on is off. */
export function requireEmailInboxEnabled(): Response | null {
  if (hasEmailInbox()) return null;
  return jsonResponse(
    { ok: false, error: 'Email inbox is not enabled on this install. Turn on Inbox Triage under Add-ons.' },
    404,
  );
}
