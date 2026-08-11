/**
 * POST /api/site/assistant — public marketing-site "speed dial" help chat.
 *
 * Same pattern as the client-portal assistant (`/api/c/:slug/assistant`):
 * no auth, rate-limited per IP, no tools, no persisted history. See
 * `src/lib/siteAssistant.ts`.
 */
import type { APIRoute } from 'astro';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { hasFeature } from '../../../lib/features';
import { json } from '../../../lib/apiJson';
import {
  getSiteAssistantPageContext,
  isSiteAssistantConfigured,
  normalizeSiteAssistantPagePath,
  runSiteAssistantReply,
  type SiteAssistantTurn,
} from '../../../lib/siteAssistant';
import { checkPortalAssistantRateLimit } from '../../../lib/portalAssistantRateLimit';
import { clientIp } from '../../../lib/clientIp';

export const prerender = false;

const MAX_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_TURN_CHARS = 4_000;

function parseHistory(raw: unknown): SiteAssistantTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteAssistantTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === 'assistant' ? 'assistant' : rec.role === 'user' ? 'user' : null;
    const content = typeof rec.content === 'string' ? rec.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, MAX_HISTORY_TURN_CHARS) });
  }
  return out;
}

export const POST: APIRoute = async ({ request }) => {
  if (!hasFeature('portal_assistant') || !isSiteAssistantConfigured()) {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ ok: false, error: 'message is required' }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ ok: false, error: 'Message is too long.' }, 400);
  }
  const history = parseHistory(body.history);
  let pagePath = normalizeSiteAssistantPagePath(
    typeof body.pagePath === 'string' ? body.pagePath : '',
  );
  if (!pagePath) {
    try {
      const referer = request.headers.get('referer');
      if (referer) pagePath = normalizeSiteAssistantPagePath(new URL(referer).pathname);
    } catch {
      /* ignore malformed referer */
    }
  }

  const rate = checkPortalAssistantRateLimit(`site:${clientIp(request)}`);
  if (!rate.ok) {
    return json(
      { ok: false, error: "You're sending messages a bit fast — please wait a moment and try again." },
      429,
    );
  }

  const org = await getCompanyConfig(request);
  const result = await runSiteAssistantReply({
    context: {
      brand: {
        name: org.name,
        description: org.description,
        supportEmail: org.supportEmail,
        supportPhone: org.supportPhone,
        domain: org.domain,
        siteUrl: org.siteUrl,
      },
      page: getSiteAssistantPageContext(pagePath),
    },
    message,
    history,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, reply: result.reply });
};
