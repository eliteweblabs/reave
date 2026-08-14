/**
 * POST /api/site/assistant — public marketing-site "speed dial" help chat.
 *
 * Same pattern as the client-portal assistant (`/api/c/:slug/assistant`):
 * no auth, rate-limited per IP, no tools, no persisted history. See
 * `src/lib/siteAssistant.ts`.
 */
import type { APIRoute } from 'astro';
import { parseAssistantHistory } from '../../../lib/assistantHistory';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { hasFeature } from '../../../lib/features';
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

export const POST: APIRoute = async ({ request }) => {
  if (!hasFeature('portal_assistant') || !isSiteAssistantConfigured()) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const { body } = parsed;

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return jsonResponse({ ok: false, error: 'message is required' }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return jsonResponse({ ok: false, error: 'Message is too long.' }, 400);
  }
  const history = parseAssistantHistory<SiteAssistantTurn>(
    body.history,
    MAX_HISTORY_TURNS,
    MAX_HISTORY_TURN_CHARS,
  );
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
    return jsonResponse(
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

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502);
  return jsonResponse({ ok: true, reply: result.reply });
};
