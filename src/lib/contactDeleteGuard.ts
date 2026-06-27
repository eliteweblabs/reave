/**
 * Pre-delete checks: linked jobs (Postgres/files) and Crater invoices.
 */

import { getContact } from './contactApi';
import { isCraterConfigured, craterGetClientBilling } from './craterClient';
import { storeListWork } from './workStore';

export type ContactDeleteBlockers = {
  name: string;
  job_count: number;
  invoice_count: number;
};

export async function getContactDeleteBlockers(
  uid: string,
): Promise<{ ok: true; data: ContactDeleteBlockers } | { ok: false; error: string }> {
  const trimmed = uid.trim();
  if (!trimmed) return { ok: false, error: 'uid is required' };

  const contact = await getContact(trimmed);
  if (!contact.ok) return { ok: false, error: contact.error };

  const jobs = await storeListWork({ contact_uid: trimmed });
  const job_count = jobs?.length ?? 0;

  let invoice_count = 0;
  if (isCraterConfigured()) {
    const billing = await craterGetClientBilling({
      email: contact.data.email ?? undefined,
      name: contact.data.name,
    });
    if (billing.ok && billing.data) {
      invoice_count = billing.data.outstanding.length + billing.data.previous.length;
    }
  }

  return {
    ok: true,
    data: { name: contact.data.name, job_count, invoice_count },
  };
}
