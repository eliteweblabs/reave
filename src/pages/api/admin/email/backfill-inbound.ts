/**
 * POST /api/admin/email/backfill-inbound — owner-only Resend receiving backfill.
 */
import type { APIContext } from 'astro';
import { backfillResendInbound } from '../../../../lib/backfillResendInbound';
import { requireOwnerUser } from '../../../../lib/staffAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireOwnerUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const dryRun = body.dryRun === true || body.dry_run === true;
  const maxRaw = body.max ?? body.limit;
  const max = maxRaw != null ? Number(maxRaw) : 300;

  try {
    const result = await backfillResendInbound({
      dryRun,
      max: Number.isFinite(max) ? max : 300,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : 'Backfill failed' },
      502,
    );
  }
}
