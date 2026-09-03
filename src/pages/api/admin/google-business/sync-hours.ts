/**
 * POST /api/admin/google-business/sync-hours — push Company hours to GBP now.
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { jsonResponse } from '../../../../lib/apiResponse';
import { syncGbpHoursFromReave } from '../../../../lib/gbpHoursSync';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const result = await syncGbpHoursFromReave({ request: context.request });
  return jsonResponse(result);
}
