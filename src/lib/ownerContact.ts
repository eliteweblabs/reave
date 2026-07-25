/**
 * Owner contact resolution — maps the logged-in admin user to a contact-api
 * record so the agent can assign internal projects to the owner without
 * requiring a separate client lookup.
 *
 * The owner is identified by the Clerk user's primary email address. We look
 * up (or cache) a matching contact-api record by email. If no match exists we
 * return null — we do NOT auto-create, because the owner might prefer a
 * specific contact record to be created manually.
 */

import { resolveContact, listContacts } from './contactApi';
import { serverEnv } from './serverEnv';

export interface OwnerContactRecord {
  uid: string;
  name: string;
  email?: string;
}

/** In-process cache keyed by userId (Clerk). Cleared on startup. */
const cache = new Map<string, OwnerContactRecord | null>();

/**
 * Resolve the owner's contact-api record by Clerk userId.
 * Fetches the Clerk user profile server-side via the Clerk backend API, then
 * looks up the matching contact by email. Returns null when no match is found.
 *
 * Pass `forceRefresh` to bypass the in-process cache.
 */
export async function resolveOwnerContact(
  userId: string,
  opts?: { forceRefresh?: boolean },
): Promise<OwnerContactRecord | null> {
  const key = userId.trim();
  if (!key) return null;

  if (!opts?.forceRefresh && cache.has(key)) {
    return cache.get(key) ?? null;
  }

  const email = await getClerkUserEmail(key);
  if (!email) {
    cache.set(key, null);
    return null;
  }

  const result = await resolveContact({ email });
  if (result.ok && result.data && typeof result.data === 'object') {
    const payload = result.data as Record<string, unknown>;
    const match = String(payload.match ?? '').toLowerCase();
    const contact = payload.contact as Record<string, unknown> | undefined;
    if ((match === 'exact' || match === 'likely') && contact?.uid) {
      const record: OwnerContactRecord = {
        uid: String(contact.uid),
        name: contact.name ? String(contact.name) : email.split('@')[0] ?? 'Owner',
        email,
      };
      cache.set(key, record);
      return record;
    }
  }

  // Fallback: search by email substring in the full contacts list
  const list = await listContacts({ q: email, limit: 5 });
  if (list.ok && list.data?.contacts?.length) {
    const hit = list.data.contacts.find(
      (c: Record<string, unknown>) =>
        typeof c.email === 'string' && c.email.toLowerCase() === email.toLowerCase(),
    );
    if (hit && hit.uid) {
      const record: OwnerContactRecord = {
        uid: String(hit.uid),
        name: hit.name ? String(hit.name) : email.split('@')[0] ?? 'Owner',
        email,
      };
      cache.set(key, record);
      return record;
    }
  }

  cache.set(key, null);
  return null;
}

/**
 * Fetch the primary email for a Clerk userId using the Clerk backend API.
 * Returns null when CLERK_SECRET_KEY is unavailable or the request fails.
 */
async function getClerkUserEmail(userId: string): Promise<string | null> {
  const secretKey =
    serverEnv('CLERK_SECRET_KEY') || serverEnv('CLERK_BACKEND_API_KEY');
  if (!secretKey) return null;

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const addresses = data.email_addresses as Array<Record<string, unknown>> | undefined;
    if (!addresses?.length) return null;

    // Prefer the primary address
    const primaryId = data.primary_email_address_id as string | undefined;
    if (primaryId) {
      const primary = addresses.find((a) => a.id === primaryId);
      if (primary?.email_address) return String(primary.email_address);
    }
    const first = addresses[0];
    if (first?.email_address) return String(first.email_address);
  } catch {
    // Silently fail — owner contact is a best-effort enhancement
  }
  return null;
}

/** Clear the in-process cache for a specific userId (e.g. after profile update). */
export function clearOwnerContactCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
