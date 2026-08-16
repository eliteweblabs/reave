/**
 * Client mark on the audit sales sheet.
 * Prefer an uploaded portal logo, then the scraped website logo/icon,
 * otherwise a red X and a note that the site has no logo.
 */
import {
  extractPortal,
  getContact,
  type ContactRecord,
} from './contactApi';
import { resolveClientIconUrl, resolveClientLogoUrl } from './clientBranding';
import {
  enrichClientPortalBrand,
  fetchClientBrandFromWebsite,
  guessClientWebsite,
} from './clientBrand';
import {
  CLIENT_LOGO_MISSING_NOTE,
  CLIENT_LOGO_SCRAPED_NOTE,
  type ClientLogoMark,
} from './auditClientLogoMark';

export {
  CLIENT_LOGO_MISSING_NOTE,
  CLIENT_LOGO_SCRAPED_NOTE,
  DOCUMENT_CLIENT_MARK_CSS,
  clientLogoStatusLabel,
  renderClientLogoMarkHtml,
  type ClientLogoMark,
  type ClientLogoSource,
} from './auditClientLogoMark';

const EXAMPLE_HOST_RE = /\.(?:example|test|invalid|localhost)\b/i;

export function resolveClientLogoMark(contact?: ContactRecord | null): ClientLogoMark {
  if (!contact?.uid || contact.uid === 'preview') {
    return { src: '', source: 'missing', note: CLIENT_LOGO_MISSING_NOTE };
  }
  const portal = extractPortal(contact);
  if (portal?.logoSource === 'upload') {
    const src = resolveClientLogoUrl(portal, contact.uid, { bg: 'light' });
    if (src) return { src, source: 'upload', note: '' };
  }
  const scraped =
    resolveClientLogoUrl(portal, contact.uid, { bg: 'light' }) ||
    resolveClientIconUrl(portal, contact.uid, { bg: 'light' });
  if (scraped) {
    return { src: scraped, source: 'website', note: CLIENT_LOGO_SCRAPED_NOTE };
  }
  return { src: '', source: 'missing', note: CLIENT_LOGO_MISSING_NOTE };
}

function shouldScrape(contact: ContactRecord, website?: string): boolean {
  if (!contact.uid || contact.uid === 'preview') return false;
  const host = String(website || contact.company || '');
  if (EXAMPLE_HOST_RE.test(host)) return false;
  return true;
}

/** Resolve uploaded → scraped (fetch if needed) → missing. Never throws. */
export async function ensureClientLogoMark(
  contact?: ContactRecord | null,
  website?: string,
): Promise<ClientLogoMark> {
  const first = resolveClientLogoMark(contact);
  if (first.source !== 'missing' || !contact?.uid) return first;
  if (!shouldScrape(contact, website)) return first;

  try {
    await enrichClientPortalBrand(contact.uid);
    const refreshed = await getContact(contact.uid);
    if (refreshed.ok) {
      const next = resolveClientLogoMark(refreshed.data);
      if (next.source !== 'missing') return next;
    }
    const portal = extractPortal(contact);
    const url = (website || '').trim() || guessClientWebsite(contact, portal) || '';
    if (!url || EXAMPLE_HOST_RE.test(url)) return first;
    const brand = await fetchClientBrandFromWebsite(url);
    const src = brand?.logoUrl || brand?.iconUrl || '';
    if (src) return { src, source: 'website', note: CLIENT_LOGO_SCRAPED_NOTE };
  } catch (e) {
    console.warn('[audit-client-logo] scrape failed', e);
  }
  return first;
}
