/**
 * GET  /api/demo/suite — parse demo suite from query string (public)
 * POST /api/demo/suite — store demo suite in cookie and return redirect target
 */
import type { APIContext } from 'astro';
import {
  DEMO_SUITE_COOKIE,
  DEMO_SUITE_COOKIE_MAX_AGE,
  buildDemoSuiteUrl,
  demoModuleCatalog,
  parseDemoSuiteCookie,
  parseDemoSuiteFromSearchParams,
  serializeDemoSuite,
} from '../../../lib/demoSuite';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const parsed = parseDemoSuiteFromSearchParams(url.searchParams);
  const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);

  if (!parsed) {
    return json({
      ok: true,
      catalog: demoModuleCatalog(),
      suite: cookieSuite,
      example: buildDemoSuiteUrl(url.origin, {
        moduleIds: ['001', '004', '006', '009'],
        industry: 'plumbing',
        tier: 1,
      }),
    });
  }

  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error, catalog: demoModuleCatalog() }, 400);
  }

  return json({ ok: true, suite: parsed.suite, catalog: demoModuleCatalog() });
}

export async function POST(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  let parsed = parseDemoSuiteFromSearchParams(url.searchParams);

  if (!parsed) {
    try {
      const body = (await context.request.json()) as { suite?: unknown };
      if (body.suite && typeof body.suite === 'object') {
        const s = body.suite as Record<string, unknown>;
        const params = new URLSearchParams();
        params.set('demo', `tier-${s.tier ?? 1}`);
        params.set('modules', `[${(s.moduleIds as string[] | undefined)?.join(',') ?? ''}]`);
        params.set('industry', String(s.industry ?? 'general'));
        parsed = parseDemoSuiteFromSearchParams(params);
      }
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
  }

  if (!parsed || !parsed.ok) {
    return json({ error: parsed && !parsed.ok ? parsed.error : 'Missing demo suite params' }, 400);
  }

  context.cookies.set(DEMO_SUITE_COOKIE, serializeDemoSuite(parsed.suite), {
    path: '/',
    maxAge: DEMO_SUITE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    httpOnly: false,
  });

  return json({
    ok: true,
    suite: parsed.suite,
    redirect: '/admin/?demoSuite=1',
  });
}
