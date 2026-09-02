/**
 * GET /api/c/:slug/directories — lazy directories icon grid for portal Overview.
 *
 * Public (unguessable /c/<uid>). Runs live site-link + Brave name search —
 * deliberately not on the SSR path so Overview first paint stays fast.
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  contactStringField,
  extractPortal,
  getContact,
} from '../../../../lib/contactApi';
import { hasFeature } from '../../../../lib/features';
import { clientIp } from '../../../../lib/clientIp';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';
import { checkDirectoryCoverage } from '../../../../lib/salesSheetDirectoryCheck';
import { renderPortalDirectoriesExhibitHtml } from '../../../../lib/salesSheetExhibits';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  if (!hasFeature('client_portal')) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const uid = (params.slug ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Missing contact id' }, 400);

  const rate = checkInMemoryRateLimit(`portal-dirs:${uid}:${clientIp(request)}`, {
    windowMs: 60_000,
    maxPerWindow: 12,
  });
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many requests' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const contactRes = await getContact(uid);
  if (!contactRes.ok || contactRes.data.archived) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }
  const portal = extractPortal(contactRes.data) ?? {};
  if (portal.enabled === false) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const website = contactStringField(portal.website) || '';
  const businessName =
    contactStringField(contactRes.data.company) ||
    contactStringField(contactRes.data.name) ||
    '';

  if (!website && !businessName) {
    return jsonResponse({ ok: false, error: 'No website or business name' }, 400);
  }

  const directoryChecks = await checkDirectoryCoverage({
    website,
    businessName,
  });

  const html = renderPortalDirectoriesExhibitHtml({
    directoryChecks,
    website,
    businessName,
  });

  return jsonResponse({
    ok: true,
    html,
    summary: directoryChecks.filter((c) => c.verdict === 'pass').length,
    total: directoryChecks.length,
  });
};
