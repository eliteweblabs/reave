/**
 * GET /api/hub/module-audience — satellites pull global module audience from Reave.
 * Auth: same hub key as punchlist (X-Install-Slug + X-Install-Key / Bearer).
 */
import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/apiResponse';
import { audienceMapFromCatalog } from '../../../../lib/moduleAudienceHub';
import {
  isPunchlistHubHost,
  verifyPunchlistHubAuth,
} from '../../../../lib/punchlistHub';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isPunchlistHubHost()) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const payload = await audienceMapFromCatalog();
  return jsonResponse({
    ok: true,
    audience: payload.audience,
    updatedAt: payload.updatedAt,
    slug: auth.slug,
  });
};
