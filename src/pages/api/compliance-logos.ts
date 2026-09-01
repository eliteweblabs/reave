/**
 * GET /api/compliance-logos — public list of regulatory / accessibility marks.
 *
 * Files live in `public/logos/compliance/`; drop a logo there and it shows up here.
 */
import type { APIRoute } from 'astro';
import { listComplianceLogos } from '../../lib/complianceLogos';
import { jsonResponse } from '../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async () => {
  const logos = listComplianceLogos();
  return jsonResponse({ ok: true, logos }, 200, { cache: 'public, max-age=300' });
};
