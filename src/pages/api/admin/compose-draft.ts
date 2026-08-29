/**
 * POST /api/admin/compose-draft — agent writes an email or social draft.
 * Does not send or publish.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../lib/companyConfig';
import {
  generateComposeDraft,
  isComposeDraftKind,
  type ComposeDraftIncoming,
} from '../../../lib/composeDraft.ts';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function incomingFromBody(raw: unknown): ComposeDraftIncoming | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const incoming: ComposeDraftIncoming = {};
  if (typeof o.from === 'string') incoming.from = o.from;
  if (typeof o.subject === 'string') incoming.subject = o.subject;
  if (typeof o.body === 'string') incoming.body = o.body;
  return incoming.from || incoming.subject || incoming.body ? incoming : undefined;
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const kind = String(body.kind ?? '').trim();
  if (!isComposeDraftKind(kind)) {
    return jsonResponse({ ok: false, error: 'kind must be email, social_reply, or social_post' }, 400);
  }

  const company = await getCompanyConfig(context.request);
  const result = await generateComposeDraft({
    kind,
    companyName: company.name,
    to: typeof body.to === 'string' ? body.to : undefined,
    subject: typeof body.subject === 'string' ? body.subject : undefined,
    currentBody: typeof body.currentBody === 'string' ? body.currentBody : undefined,
    incoming: incomingFromBody(body.incoming),
    platform: typeof body.platform === 'string' ? body.platform : undefined,
    authorName: typeof body.authorName === 'string' ? body.authorName : undefined,
    incomingText: typeof body.incomingText === 'string' ? body.incomingText : undefined,
  });

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502);
  return jsonResponse({ ok: true, draft: result.draft });
}
