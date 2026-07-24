/**
 * GET /api/admin/social/platforms — catalog of supported social link fields for
 * the Socials settings UI (labels, placeholders, icons, config field names).
 */
import type { APIContext } from 'astro';
import {
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
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  return json({
    ok: true,
    platforms: socialPlatformCatalogForUi(),
    defaultVisible: DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  });
}
