/**
 * GET  /api/demo/suite — parse demo suite from query string (public)
 * POST /api/demo/suite — store demo suite in cookie and return redirect target
 */
import type { APIContext } from 'astro';
import { checkDemoLoaderCatalogRateLimit } from '../../../lib/demoLaunch';
import { demoModuleIdForFeature } from '../../../lib/demoModuleCatalog';
import {
  DEMO_SUITE_COOKIE,
  DEMO_SUITE_COOKIE_MAX_AGE,
  buildDemoSuiteUrl,
  demoModuleCatalog,
  parseDemoSuiteCookie,
  parseDemoSuiteFromSearchParams,
  serializeDemoSuite,
} from '../../../lib/demoSuite';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const parsed = parseDemoSuiteFromSearchParams(url.searchParams);
  const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);

  if (!parsed) {
    return jsonResponse({
      ok: true,
      catalog: demoModuleCatalog(),
      suite: cookieSuite,
      example: buildDemoSuiteUrl(url.origin, {
        moduleIds: [
          demoModuleIdForFeature('client_portal'),
          demoModuleIdForFeature('billing'),
          demoModuleIdForFeature('site_monitoring'),
          demoModuleIdForFeature('voice'),
        ],
        industry: 'plumbing',
        tier: 1,
      }),
    });
  }

  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error, catalog: demoModuleCatalog() }, 400);
  }

  return jsonResponse({ ok: true, suite: parsed.suite, catalog: demoModuleCatalog() });
}

export async function POST(context: APIContext): Promise<Response> {
  const rate = checkDemoLoaderCatalogRateLimit(context.request);
  if (!rate.ok) {
    return jsonResponse(
      { error: 'Too many requests' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const url = new URL(context.request.url);
  let parsed = parseDemoSuiteFromSearchParams(url.searchParams);

  if (!parsed) {
    const bodyParsed = await readJsonBody(context.request);
    if (bodyParsed instanceof Response) return bodyParsed;
    const body = bodyParsed.body;
    if (body.suite && typeof body.suite === 'object') {
      const s = body.suite as Record<string, unknown>;
      const params = new URLSearchParams();
      params.set('demo', `tier-${s.tier ?? 1}`);
      params.set('modules', `[${(s.moduleIds as string[] | undefined)?.join(',') ?? ''}]`);
      params.set('industry', String(s.industry ?? 'general'));
      parsed = parseDemoSuiteFromSearchParams(params);
    }
  }

  if (!parsed || !parsed.ok) {
    return jsonResponse(
      { error: parsed && !parsed.ok ? parsed.error : 'Missing demo suite params' },
      400,
    );
  }

  context.cookies.set(DEMO_SUITE_COOKIE, serializeDemoSuite(parsed.suite), {
    path: '/',
    maxAge: DEMO_SUITE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    httpOnly: false,
  });

  return jsonResponse({
    ok: true,
    suite: parsed.suite,
    redirect: '/admin/?demoSuite=1',
  });
}
