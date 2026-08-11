/**
 * GET /api/admin/seo-directory — SEO Directory API Kit status (auth required).
 *
 * Returns agency wiring, modes, and whether BrightLocal is configured.
 * Citation Builder / checklist CRUD endpoints land in follow-up work.
 */
import type { APIContext } from 'astro';
import { seoDirectoryStatus } from '../../../lib/brightlocalClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('seo_directory')) {
    return json(
      {
        error: 'SEO Directory API Kit is not enabled',
        hint: 'Add seo_directory to this install’s features[] in config/config-{slug}.json',
      },
      404,
    );
  }

  return json(seoDirectoryStatus());
}
