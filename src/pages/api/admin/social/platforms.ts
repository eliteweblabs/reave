/**
 * GET /api/admin/social/platforms — catalog of supported social link fields for
 * the Socials settings UI (labels, placeholders, icons, config field names).
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';
import {
  DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  socialPlatformCatalogForUi,
} from '../../../../lib/social/platforms.ts';

export const prerender = false;

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
