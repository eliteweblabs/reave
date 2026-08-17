/**
 * POST /api/admin/company/scrape-fonts — detect typography from the company website.
 * Body: { website?: string } — optional override; defaults to Company domain.
 */

import type { APIRoute } from 'astro';
import { brandFontCatalogForAdminAsync } from '../../../../lib/googleFontsCatalog';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../../../../lib/companyConfigStore';
import { normalizePublicUrl } from '../../../../lib/publicUrl';
import { detectWebsiteFonts } from '../../../../lib/websiteFonts';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function websiteFromDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed) return null;
  const url = normalizePublicUrl(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`, true);
  return url?.origin ?? null;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = await context.request.json();
  } catch {
    // optional body
  }

  const company = await getCompanyConfig(context.request);
  const websiteInput = typeof body.website === 'string' ? body.website.trim() : '';
  const website =
    websiteInput ||
    websiteFromDomain(company.domain) ||
    websiteFromDomain(typeof body.domain === 'string' ? body.domain : '') ||
    null;

  if (!website) {
    return json(
      { ok: false, error: 'Set PUBLIC_SITE_DOMAIN on this deployment first.' },
      400,
    );
  }

  const detected = await detectWebsiteFonts(website);
  if (!detected) {
    return json(
      {
        ok: false,
        error: `Couldn't read fonts from ${website}. The website may block automated requests.`,
        website,
      },
      404,
    );
  }

  const existing = await getStoredCompanyConfig();
  const mergedSpecs = {
    ...(existing?.fontGoogleSpecs ?? {}),
    ...detected.fontGoogleSpecs,
  };

  const ok = await setStoredCompanyConfig({
    fontPrimary: detected.fontPrimaryId,
    fontSecondary: detected.fontSecondaryId,
    fontContent: detected.fontContentId,
    fontGoogleSpecs: Object.keys(mergedSpecs).length ? mergedSpecs : null,
  });

  if (!ok) {
    return json({ ok: false, error: 'Fonts detected but failed to save company settings.' }, 500);
  }

  const updated = await getCompanyConfig(context.request);
  const imported = [
    detected.sources.primary && `Primary: ${detected.sources.primary}`,
    detected.sources.secondary && `Secondary: ${detected.sources.secondary}`,
    detected.sources.content && `Content: ${detected.sources.content}`,
  ].filter(Boolean);

  return json({
    ok: true,
    website: detected.website,
    company: updated,
    fontCatalog: await brandFontCatalogForAdminAsync(),
    detectedFamilies: detected.detectedFamilies,
    sources: detected.sources,
    message: imported.length
      ? `Fonts imported from website — ${imported.join(' · ')}`
      : 'Fonts imported from website.',
  });
};
