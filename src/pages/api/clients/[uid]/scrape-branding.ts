/**
 * POST /api/clients/:uid/scrape-branding — fetch logo/tagline from the client website.
 * Body: { website?: string } — optional; saves the URL first when provided.
 */

import type { APIRoute } from 'astro';
import {
  contactStringField,
  extractPortal,
  getContact,
  isContactApiConfigured,
} from '../../../../lib/contactApi';
import {
  enrichClientPortalBrand,
  guessClientWebsite,
  setClientPortalWebsite,
  websiteFromNotes,
} from '../../../../lib/clientBrand';
import {
  resolveClientIconUrl,
  resolveClientLogoUrl,
} from '../../../../lib/clientBranding';
import { portalSiteUrl } from '../../../../lib/siteMonitoring';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const before = await getContact(uid);
  if (!before.ok || before.data.archived) {
    return json({ ok: false, error: before.ok ? 'Client not found' : before.error }, 404);
  }

  const beforePortal = extractPortal(before.data);
  if (beforePortal?.logoSource === 'upload') {
    return json(
      { ok: false, error: 'Remove the uploaded logo first to scrape from the website.' },
      400,
    );
  }

  const beforeLogo = resolveClientLogoUrl(beforePortal, uid);
  const beforeTagline = contactStringField(beforePortal?.tagline);

  const websiteInput = typeof body.website === 'string' ? body.website.trim() : '';
  let website = '';

  if (websiteInput) {
    const saved = await setClientPortalWebsite(uid, websiteInput);
    if (!saved.ok) return json({ ok: false, error: saved.error }, 400);
    website = saved.website;
  } else {
    website =
      guessClientWebsite(before.data, beforePortal) ||
      beforePortal?.website?.trim() ||
      portalSiteUrl(beforePortal) ||
      websiteFromNotes(before.data.notes ?? '') ||
      '';
    if (!website) {
      return json({ ok: false, error: 'Add a website URL for this client first.' }, 400);
    }
    await enrichClientPortalBrand(uid, { force: true });
  }

  const after = await getContact(uid);
  if (!after.ok) return json({ ok: false, error: after.error }, 502);

  const portal = extractPortal(after.data);
  const logoUrl = resolveClientLogoUrl(portal, uid);
  const iconUrl = resolveClientIconUrl(portal, uid);
  const tagline = contactStringField(portal?.tagline);

  const foundLogo = !!logoUrl && logoUrl !== beforeLogo;
  const refreshedLogo = !!logoUrl && (foundLogo || !beforeLogo);
  const foundTagline = !!tagline && tagline !== beforeTagline;

  if (!logoUrl && !foundTagline) {
    return json(
      {
        ok: false,
        error: `Couldn't find a logo on ${website}.`,
        website,
      },
      404,
    );
  }

  return json({
    ok: true,
    website,
    logoUrl,
    iconUrl,
    logoSource: portal?.logoSource,
    iconSource: portal?.iconSource,
    tagline,
    foundLogo: refreshedLogo,
    foundTagline,
    message: refreshedLogo
      ? 'Logo fetched from website.'
      : foundTagline
        ? 'Updated tagline from website.'
        : 'Website checked — logo unchanged.',
  });
};
