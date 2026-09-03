/**
 * Keep Crater customers in sync when reave.app contacts are edited.
 *
 * Matches the linked Crater customer using the contact's *previous* identity
 * (before the PATCH) so renames and email changes still find the right record.
 */
import { contactStringField, type ContactRecord } from './contactApi';
import { hasFeature } from './features';
import {
  craterBillingHintForContact,
  craterCreateCustomer,
  craterCustomerAdminUrl,
  craterFindCustomerForContact,
  craterListEstimates,
  craterListInvoices,
  craterUpdateCustomer,
  buildBillingCountsByCustomerName,
  isCraterConfigured,
  type CraterBillingHint,
  type CraterContactMatch,
} from './craterClient';

export type ContactCraterSyncResult =
  | { ok: true; synced: false; reason: 'billing_disabled' | 'unchanged' | 'no_crater_customer' }
  | { ok: true; synced: true; customerId: number; customerName: string }
  | { ok: false; error: string };

export type ContactCraterStatus = {
  configured: boolean;
  matched: boolean;
  customerId?: number;
  customerName?: string;
  label: string;
  tone: CraterBillingHint['tone'];
  adminUrl?: string | null;
};

export type ContactCraterPushResult =
  | {
      ok: true;
      created: true;
      customerId: number;
      customerName: string;
      adminUrl?: string | null;
    }
  | {
      ok: true;
      created: false;
      alreadyInCrater: true;
      customerId: number;
      customerName: string;
      synced: boolean;
      adminUrl?: string | null;
    }
  | { ok: false; error: string; reason?: 'billing_disabled' | 'missing_name' | 'route_missing' };

function contactToMatch(contact: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>): CraterContactMatch {
  return {
    name: contactStringField(contact.name) || undefined,
    email: contactStringField(contact.email) || undefined,
    phone: contactStringField(contact.phone) || undefined,
    company: contactStringField(contact.company) || undefined,
  };
}

/** Map a reave.app contact to Crater customer fields. */
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

function billingConfigured(): boolean {
  return hasFeature('billing') && isCraterConfigured();
}

/** Crater link status for a contact (no side effects). Not gated by contact kind/status. */
export async function getContactCraterStatus(
  contact: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
): Promise<ContactCraterStatus> {
  if (!billingConfigured()) {
    return {
      configured: false,
      matched: false,
      label: 'Billing not configured',
      tone: 'none',
      adminUrl: null,
    };
  }

  const match = contactToMatch(contact);
  const found = await craterFindCustomerForContact(match);
  if (!found.ok) {
    return {
      configured: true,
      matched: false,
      label: found.error,
      tone: 'none',
      adminUrl: null,
    };
  }

  const customer = found.data;
  if (!customer) {
    return {
      configured: true,
      matched: false,
      label: 'Not in Crater',
      tone: 'none',
      adminUrl: null,
    };
  }

  const [invRes, estRes] = await Promise.all([craterListInvoices(), craterListEstimates()]);
  const billingCounts =
    invRes.ok && estRes.ok
      ? buildBillingCountsByCustomerName(invRes.data.invoices ?? [], estRes.data.estimates ?? [])
      : new Map();
  const hint = craterBillingHintForContact(
    { name: match.name ?? match.company ?? customer.name, email: match.email },
    [customer],
    billingCounts,
  );

  return {
    configured: true,
    matched: true,
    customerId: customer.id,
    customerName: customer.name,
    label: hint.label,
    tone: hint.tone,
    adminUrl: craterCustomerAdminUrl(customer.id),
  };
}

/**
 * Create a Crater customer from a reave contact when none is linked yet.
 * If a match already exists, optionally refresh Crater from the contact profile.
 * Not gated by contact kind/status — any contact can be pushed for invoicing.
 */
export async function pushContactToCrater(
  contact: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
  opts?: { updateIfExists?: boolean },
): Promise<ContactCraterPushResult> {
  if (!billingConfigured()) {
    return { ok: false, error: 'Crater billing is not configured', reason: 'billing_disabled' };
  }

  const payload = craterCustomerPayloadFromContact(contact);
  if (!payload.name?.trim()) {
    return { ok: false, error: 'Contact needs a name or company before pushing to Crater', reason: 'missing_name' };
  }

  const found = await craterFindCustomerForContact(contactToMatch(contact));
  if (!found.ok) {
    if (found.status === 404 && found.error.includes('route not found')) {
      return {
        ok: false,
        error: found.error,
        reason: 'route_missing',
      };
    }
    return { ok: false, error: found.error };
  }

  if (found.data) {
    let synced = false;
    if (opts?.updateIfExists !== false) {
      const updated = await craterUpdateCustomer(found.data.id, payload);
      synced = updated.ok;
    }
    return {
      ok: true,
      created: false,
      alreadyInCrater: true,
      customerId: found.data.id,
      customerName: found.data.name,
      synced,
      adminUrl: craterCustomerAdminUrl(found.data.id),
    };
  }

  const created = await craterCreateCustomer(payload);
  if (!created.ok) {
    if (created.status === 404 && created.error.includes('route not found')) {
      return { ok: false, error: created.error, reason: 'route_missing' };
    }
    return { ok: false, error: created.error };
  }

  return {
    ok: true,
    created: true,
    customerId: created.data.customer_id,
    customerName: created.data.name,
    adminUrl: created.data.admin_url ?? craterCustomerAdminUrl(created.data.customer_id),
  };
}

/**
 * Push contact profile changes to the matched Crater customer.
 * Uses `before` to locate the customer (pre-rename identity) and `after` for new values.
 */
export async function syncContactToCrater(
  before: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
  after: Pick<ContactRecord, 'name' | 'email' | 'phone' | 'company'>,
): Promise<ContactCraterSyncResult> {
  if (!billingConfigured()) {
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
