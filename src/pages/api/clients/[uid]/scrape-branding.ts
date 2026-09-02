/**
 * POST /api/clients/:uid/scrape-branding — fetch logo/tagline from the client website.
 * Body: { website?: string, asset?: 'logo' | 'icon' | 'all' }
 */

import type { APIRoute } from 'astro';
import {
  contactStringField,
  extractPortal,
  getContact,
  isContactApiConfigured,
} from '../../../../lib/contactApi';
import {
  applyClientPortalScrapedBrand,
  fetchClientBrandFromWebsite,
  guessClientWebsite,
  normalizeClientWebsiteInput,
  persistFetchedBrandAsset,
  setClientPortalWebsite,
  websiteFromNotes,
} from '../../../../lib/clientBrand';
import {
  resolveClientIconUrl,
  resolveClientLogoUrl,
} from '../../../../lib/clientBranding';
import { portalSiteUrl } from '../../../../lib/siteMonitoring';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

type ScrapeAsset = 'logo' | 'icon' | 'all';

function parseScrapeAsset(raw: unknown): ScrapeAsset {
  if (raw === 'logo' || raw === 'icon') return raw;
  return 'all';
}

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown> = {};
  try {
    body = await context.request.json();
  } catch {
    // optional body
  }

  const asset = parseScrapeAsset(body.asset);

  const before = await getContact(uid);
  if (!before.ok || before.data.archived) {
    return jsonResponse({ ok: false, error: before.ok ? 'Client not found' : before.error }, 404);
  }

  const beforePortal = extractPortal(before.data);
  if ((asset === 'logo' || asset === 'all') && beforePortal?.logoSource === 'upload') {
    return jsonResponse(
      { ok: false, error: 'Remove the uploaded logo first to scrape from the website.' },
      400,
    );
  }
  if ((asset === 'icon' || asset === 'all') && beforePortal?.iconSource === 'upload') {
    return jsonResponse(
      { ok: false, error: 'Remove the uploaded icon first to scrape from the website.' },
      400,
    );
  }

  const beforeLogo = resolveClientLogoUrl(beforePortal, uid);
  const beforeIcon = resolveClientIconUrl(beforePortal, uid);
  const beforeTagline = contactStringField(beforePortal?.tagline);

  const websiteInput = typeof body.website === 'string' ? body.website.trim() : '';
  let website = '';

  if (websiteInput) {
    const saved = await setClientPortalWebsite(uid, websiteInput);
    if (!saved.ok) return jsonResponse({ ok: false, error: saved.error }, 400);
    website = saved.website;
  } else {
    website =
      guessClientWebsite(before.data, beforePortal) ||
      beforePortal?.website?.trim() ||
      portalSiteUrl(beforePortal) ||
      websiteFromNotes(before.data.notes ?? '') ||
      '';
    if (!website) {
      return jsonResponse({ ok: false, error: 'Add a website URL for this client first.' }, 400);
    }
  }

  website = normalizeClientWebsiteInput(website);
  const brand = await fetchClientBrandFromWebsite(website);
  if (!brand) {
    return jsonResponse(
      { ok: false, error: `Couldn't fetch branding from ${website}.`, website },
      502,
    );
  }

  const wantsLogo = asset === 'logo' || asset === 'all';
  const wantsIcon = asset === 'icon' || asset === 'all';
  const hasLogo = wantsLogo && !!brand.logoUrl;
  const hasIcon = wantsIcon && !!brand.iconUrl;
  const hasTagline = asset === 'all' && !!brand.tagline;

  if (!hasLogo && !hasIcon && !hasTagline) {
    const label = asset === 'icon' ? 'icon' : 'logo';
    return jsonResponse(
      {
        ok: false,
        error: `Couldn't find an ${label} on ${website}.`,
        website,
      },
      404,
    );
  }

  if (asset === 'all') {
    const applied = await applyClientPortalScrapedBrand(uid, brand, {
      logo: wantsLogo,
      icon: wantsIcon,
      tagline: true,
      website,
      uploadedBy: userId,
    });
    if (!applied.ok) return jsonResponse({ ok: false, error: applied.error }, 502);
  } else {
    const remoteUrl = asset === 'logo' ? brand.logoUrl : brand.iconUrl;
    const saved = await persistFetchedBrandAsset({
      website,
      remoteUrl: remoteUrl || '',
      asset,
      contactUid: uid,
      uploadedBy: userId,
    });
    if (!saved.ok) return jsonResponse({ ok: false, error: saved.error }, 502);
    if (asset === 'logo' && brand.tagline) {
      await applyClientPortalScrapedBrand(uid, brand, {
        tagline: true,
        website,
        uploadedBy: userId,
      });
    }
  }

  const after = await getContact(uid);
  if (!after.ok) return jsonResponse({ ok: false, error: after.error }, 502);

  const portal = extractPortal(after.data);
  const logoUrl = resolveClientLogoUrl(portal, uid);
  const iconUrl = resolveClientIconUrl(portal, uid);
  const tagline = contactStringField(portal?.tagline);

  const foundLogo = !!logoUrl && logoUrl !== beforeLogo;
  const refreshedLogo = !!logoUrl && (foundLogo || !beforeLogo);
  const foundIcon = !!iconUrl && iconUrl !== beforeIcon;
  const refreshedIcon = !!iconUrl && (foundIcon || !beforeIcon);
  const foundTagline = !!tagline && tagline !== beforeTagline;

  return jsonResponse({
    ok: true,
    website,
    logoUrl,
    iconUrl,
    logoSource: portal?.logoSource,
    iconSource: portal?.iconSource,
    tagline,
    foundLogo: refreshedLogo,
    foundIcon: refreshedIcon,
    foundTagline,
    message:
      asset === 'icon'
        ? refreshedIcon
          ? 'Icon fetched from website.'
          : 'Website checked — icon unchanged.'
        : refreshedLogo
          ? 'Logo fetched from website.'
          : foundTagline
            ? 'Updated tagline from website.'
            : 'Website checked — logo unchanged.',
  });
};
