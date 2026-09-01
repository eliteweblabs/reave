import type { APIRoute } from 'astro';
import { buildBrandingApiPayload } from '../../../lib/brandingApiPayload';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

/** Admin branding for Crater invoice mail, agents, and integrations. */
export const GET: APIRoute = async (context) => {
  const payload = await buildBrandingApiPayload(context);
  return jsonResponse(payload, 200, { cache: 'public, max-age=60' });
};
