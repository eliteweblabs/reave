/**
 * Shared GET handler for company logo wordmark PNG routes.
 * Served at /api/branding/logo.
 */
import type { APIContext } from 'astro';
import { analyzeLogoContrast, adaptLogoContrast } from './logoContrastAdapt';
import { brandingEtag, renderCompanyLogoWordmarkPng } from './brandImageRender';
import {
  brandingPngHttpResponse,
  resolveCachedBrandingPng,
} from './brandingPngResponse';
import { getStoredCompanyConfig } from './companyConfigStore';

/** Light email / admin canvas — flip a mostly-white wordmark to dark ink. */
async function wordmarkForLightBackground(png: Buffer): Promise<Buffer> {
  const analysis = await analyzeLogoContrast(png);
  if (!analysis.mostlyWhite) return png;
  return (await adaptLogoContrast(png, 'light')).buffer;
}

/** Dark invoice / PDF canvas — flip a mostly-black wordmark to light ink. */
async function wordmarkForDarkBackground(png: Buffer): Promise<Buffer> {
  const analysis = await analyzeLogoContrast(png);
  if (!analysis.mostlyBlack) return png;
  return (await adaptLogoContrast(png, 'dark')).buffer;
}

export async function brandingLogoPngGet(context: APIContext): Promise<Response> {
  const { request, url } = context;
  const stored = await getStoredCompanyConfig();
  const forEmail =
    url.searchParams.get('email') === '1' || url.searchParams.get('bg') === 'light';
  const etagInner = brandingEtag(stored, 640, forEmail ? 'logo-email' : 'logo');

  let body = await resolveCachedBrandingPng(etagInner, async () => {
    let png = await renderCompanyLogoWordmarkPng(stored);
    if (!png) return null;
    if (forEmail) {
      png = await wordmarkForLightBackground(png);
    }
    return png;
  });
  if (!body) {
    return new Response('Not found', { status: 404 });
  }

  return brandingPngHttpResponse(request, url, etagInner, body);
}

/** Wordmark for dark backgrounds — /api/branding/logo.alt */
export async function brandingLogoAltPngGet(context: APIContext): Promise<Response> {
  const { request, url } = context;
  const stored = await getStoredCompanyConfig();
  const etagInner = brandingEtag(stored, 640, 'logo-alt');

  const body = await resolveCachedBrandingPng(etagInner, async () => {
    let png = await renderCompanyLogoWordmarkPng(stored);
    if (!png) return null;
    return wordmarkForDarkBackground(png);
  });
  if (!body) {
    return new Response('Not found', { status: 404 });
  }

  return brandingPngHttpResponse(request, url, etagInner, body);
}
