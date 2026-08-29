/**
 * POST /api/demo/launch — gated demo-loader request (name/email + abuse limits).
 * Creates a proposed client, inquiry project, and critical dashboard notice.
 * Auto sandbox redirect is paused.
 */
import type { APIContext } from 'astro';
import { processDemoLaunch } from '../../../lib/demoLaunch';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await processDemoLaunch(context.request, {
    name: String(body.name ?? body.fullName ?? ''),
    email: String(body.email ?? ''),
    industry: typeof body.industry === 'string' ? body.industry : undefined,
    moduleIds: Array.isArray(body.moduleIds) ? (body.moduleIds as string[]) : undefined,
    tier: typeof body.tier === 'number' ? body.tier : undefined,
    website: typeof body.website === 'string' ? body.website : typeof body.company_url === 'string' ? body.company_url : '',
  });

  if (!result.ok) {
    const headers =
      result.status === 429 && result.retryAfterSeconds != null
        ? { 'Retry-After': String(result.retryAfterSeconds) }
        : undefined;
    return jsonResponse({ ok: false, error: result.error }, result.status, { headers });
  }

  return jsonResponse({
    ok: true,
    contactUid: result.contactUid,
    jobSlug: result.jobSlug,
    jobTitle: result.jobTitle,
  });
}
