/**
 * Agency + client websites that can appear in the Analytics site picker.
 */
import {
  attachPortalLinksForList,
  contactIsPersonal,
  extractPortal,
  isContactApiConfigured,
  listContacts,
} from './contactApi';
import { hostnameFromWebsite, plausibleSiteId } from './plausibleClient';

export type AnalyticsSiteOption = {
  siteId: string;
  label: string;
  kind: 'agency' | 'client';
  contactUid?: string;
  website?: string;
};

export async function listAnalyticsSites(companyDomain: string): Promise<AnalyticsSiteOption[]> {
  const seen = new Set<string>();
  const out: AnalyticsSiteOption[] = [];

  const agency = hostnameFromWebsite(companyDomain) || hostnameFromWebsite(plausibleSiteId(companyDomain));
  if (agency) {
    seen.add(agency);
    out.push({ siteId: agency, label: agency, kind: 'agency' });
  }

  if (!isContactApiConfigured()) return out;

  const listed = await listContacts({ limit: 100 });
  if (!listed.ok) return out;

  const contacts = await attachPortalLinksForList(
    listed.data.contacts.filter((c) => !c.archived),
  );
  for (const contact of contacts) {
    if (contactIsPersonal(contact)) continue;
    const portal = extractPortal(contact);
    const website = (portal?.website || '').trim();
    const siteId = hostnameFromWebsite(website);
    if (!siteId || seen.has(siteId)) continue;
    seen.add(siteId);
    out.push({
      siteId,
      label: (contact.company || contact.name || siteId).trim(),
      kind: 'client',
      contactUid: contact.uid,
      website,
    });
  }

  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'agency' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return out;
}
