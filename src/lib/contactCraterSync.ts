/**
 * Keep Crater customers in sync when REΛVE contacts are edited.
 *
 * Matches the linked Crater customer using the contact's *previous* identity
 * (before the PATCH) so renames and email changes still find the right record.
 */
import { contactStringField, type ContactRecord } from './contactApi';
import { hasFeature } from './features';
import {
  craterFindCustomerForContact,
  craterUpdateCustomer,
  isCraterConfigured,
  type CraterContactMatch,
} from './craterClient';

export type ContactCraterSyncResult =
  | { ok: true; synced: false; reason: 'billing_disabled' | 'unchanged' | 'no_crater_customer' }
  | { ok: true; synced: true; customerId: number; customerName: string }
  | { ok: false; error: string };

function contactToMatch(contact: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>): CraterContactMatch {
  return {
    name: contactStringField(contact.name) || undefined,
    email: contactStringField(contact.email) || undefined,
    phone: contactStringField(contact.phone) || undefined,
    company: contactStringField(contact.company) || undefined,
  };
}

/** Map a REΛVE contact to Crater customer fields. */
export function craterCustomerPayloadFromContact(
  contact: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
): { name: string; contact_name: string; email?: string; phone?: string } {
  const person = contactStringField(contact.name);
  const company = contactStringField(contact.company);
  const customerName = company || person;
  const contactName =
    company && person && person.toLowerCase() !== company.toLowerCase() ? person : customerName;
  return {
    name: customerName,
    contact_name: contactName,
    email: contactStringField(contact.email) || undefined,
    phone: contactStringField(contact.phone) || undefined,
  };
}

function billingIdentityChanged(before: CraterContactMatch, after: CraterContactMatch): boolean {
  return (
    (before.name ?? '') !== (after.name ?? '') ||
    (before.email ?? '') !== (after.email ?? '') ||
    (before.phone ?? '') !== (after.phone ?? '') ||
    (before.company ?? '') !== (after.company ?? '')
  );
}

/**
 * Push contact profile changes to the matched Crater customer.
 * Uses `before` to locate the customer (pre-rename identity) and `after` for new values.
 */
export async function syncContactToCrater(
  before: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
  after: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
): Promise<ContactCraterSyncResult> {
  if (!hasFeature('billing') || !isCraterConfigured()) {
    return { ok: true, synced: false, reason: 'billing_disabled' };
  }

  const beforeMatch = contactToMatch(before);
  const afterMatch = contactToMatch(after);
  if (!billingIdentityChanged(beforeMatch, afterMatch)) {
    return { ok: true, synced: false, reason: 'unchanged' };
  }

  const found = await craterFindCustomerForContact(beforeMatch);
  if (!found.ok) return { ok: false, error: found.error };
  if (!found.data) return { ok: true, synced: false, reason: 'no_crater_customer' };

  const payload = craterCustomerPayloadFromContact(after);
  const updated = await craterUpdateCustomer(found.data.id, payload);
  if (!updated.ok) return { ok: false, error: updated.error };

  return {
    ok: true,
    synced: true,
    customerId: found.data.id,
    customerName: payload.name,
  };
}
