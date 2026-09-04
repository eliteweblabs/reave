/**
 * Shared GET handler for company logo wordmark PNG routes.
 * Served at /api/branding/logo.
 */
import type { APIContext } from 'astro';
import { analyzeLogoContrast, adaptLogoContrast } from './logoContrastAdapt';
import { brandingEtag, renderCompanyLogoWordmarkPng } from './brandImageRender';
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
  let body = await renderCompanyLogoWordmarkPng(stored);
  if (!body) {
    return new Response('Not found', { status: 404 });
  }

  const forEmail =
    url.searchParams.get('email') === '1' || url.searchParams.get('bg') === 'light';
  if (forEmail) {
    body = await wordmarkForLightBackground(body);
  }

  const etag = `"${brandingEtag(stored, 640, forEmail ? 'logo-email' : 'logo')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
}

/** Wordmark for dark backgrounds — /api/branding/logo.alt */
export async function brandingLogoAltPngGet(context: APIContext): Promise<Response> {
  const { request } = context;
  const stored = await getStoredCompanyConfig();
  let body = await renderCompanyLogoWordmarkPng(stored);
  if (!body) {
    return new Response('Not found', { status: 404 });
  }

  body = await wordmarkForDarkBackground(body);

  const etag = `"${brandingEtag(stored, 640, 'logo-alt')}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
}
