/**
 * POST /api/site/assistant — public marketing-site "speed dial" help chat.
 *
 * Same pattern as the client-portal assistant (`/api/c/:slug/assistant`):
 * no auth, rate-limited per IP, no tools, no persisted history. See
 * `src/lib/siteAssistant.ts`.
 */
import type { APIRoute } from 'astro';
import { assistantRateLimitResponse, parseAssistantPostRequest } from '../../../lib/assistantRoute';
import { jsonResponse } from '../../../lib/apiResponse';
import { companyToBrandContext, getCompanyConfig } from '../../../lib/companyConfig';
import { hasFeature } from '../../../lib/features';
import {
  getSiteAssistantPageContext,
  isSiteAssistantConfigured,
  normalizeSiteAssistantPagePath,
  runSiteAssistantReply,
  type SiteAssistantTurn,
} from '../../../lib/siteAssistant';
import { clientIp } from '../../../lib/clientIp';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!hasFeature('portal_assistant') || !isSiteAssistantConfigured()) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const parsed = await parseAssistantPostRequest<SiteAssistantTurn>(request);
  if (!parsed.ok) return parsed.response;
  const { message, history, body } = parsed;

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

  const rateLimited = assistantRateLimitResponse(`site:${clientIp(request)}`);
  if (rateLimited) return rateLimited;

  const org = await getCompanyConfig(request);
  const brand = companyToBrandContext(org, request);
  const result = await runSiteAssistantReply({
    context: {
      brand: {
        name: brand.name,
        description: brand.description,
        supportEmail: brand.supportEmail,
        supportPhone: org.supportPhone,
        domain: brand.domain,
        siteUrl: brand.siteUrl,
      },
      page: getSiteAssistantPageContext(pagePath),
    },
    message,
    history,
  });

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502);
  return jsonResponse({ ok: true, reply: result.reply });
};
