/**
 * GET /api/admin/social/platforms — catalog of supported social link fields for
 * the Socials settings UI (labels, placeholders, icons, config field names).
 */
import type { APIContext } from 'astro';
import {
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
  DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  socialPlatformCatalogForUi,
} from '../../../../lib/social/platforms.ts';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  return json({
    ok: true,
    platforms: socialPlatformCatalogForUi(),
    defaultVisible: DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  });
}
