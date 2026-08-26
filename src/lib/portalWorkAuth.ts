import { getContact, extractPortal, contactStringField } from './contactApi';
import { isSafeWorkSlug, storeReadWork } from './workStore';

export async function loadPortalContact(contactUid: string) {
  const uid = contactUid.trim();
  if (!uid) return { ok: false as const, status: 400, error: 'Not found' };

  const contactRes = await getContact(uid);
  if (!contactRes.ok || contactRes.data.archived) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  const portal = extractPortal(contactRes.data);
  if (portal?.enabled === false) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  return {
    ok: true as const,
    contact: contactRes.data,
    contactName: contactStringField(contactRes.data.name) || 'Contact',
    portal,
  };
}

export async function loadPortalJob(contactUid: string, jobSlug: string) {
  const contactRes = await getContact(contactUid);
  if (!contactRes.ok || contactRes.data.archived) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  const portal = extractPortal(contactRes.data);
  if (portal?.enabled === false) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  if (!isSafeWorkSlug(jobSlug)) {
    return { ok: false as const, status: 400, error: 'Invalid job' };
  }

  const job = await storeReadWork(jobSlug);
  if (!job || job.contact_uid !== contactUid) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  return {
    ok: true as const,
    contactName: contactStringField(contactRes.data.name) || 'Contact',
    job,
  };
}
