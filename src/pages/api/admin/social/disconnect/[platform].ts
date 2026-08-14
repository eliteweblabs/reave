/**
 * POST /api/admin/social/disconnect/[platform] — remove a stored OAuth token.
 */
import type { APIContext } from 'astro';
import { json } from '../../../../../lib/apiJson';
import { isSocialPlatform } from '../../../../../lib/social/oauth.ts';
import { deleteSocialToken } from '../../../../../lib/social/tokenStore.ts';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const platform = context.params.platform?.trim() ?? '';
  if (!isSocialPlatform(platform)) return json({ ok: false, error: 'Unknown platform' }, 400);

  const ok = await deleteSocialToken(platform);
  if (!ok) return json({ ok: false, error: 'Failed to disconnect' }, 500);
  return json({ ok: true });
}
