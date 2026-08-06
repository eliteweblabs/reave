/**
 * GET /api/demo/loader — public demo loader catalog (modules + industries).
 */
import type { APIContext } from 'astro';
import { listEnabledDeckIndustries } from '../../../lib/deckIndustriesStore';
import {
  defaultDemoLoaderModuleIds,
  listDemoLoaderModules,
} from '../../../lib/demoLoaderCatalog';
import { buildDemoSuiteUrl, parseDemoSuiteCookie, DEMO_SUITE_COOKIE } from '../../../lib/demoSuite';
import { getPublicDemoSiteUrl } from '../../../lib/publicDemo';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const modules = listDemoLoaderModules();
    const industries = await listEnabledDeckIndustries();
    const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);
    const demoSiteUrl = getPublicDemoSiteUrl();

    return json({
      ok: true,
      modules,
      industries: industries.map((i) => ({ slug: i.slug, label: i.label })),
      defaultModuleIds: defaultDemoLoaderModuleIds(modules),
      suite: cookieSuite,
      demoSiteUrl,
      exampleLaunchUrl: demoSiteUrl
        ? buildDemoSuiteUrl(demoSiteUrl, {
            moduleIds: ['001', '004', '006', '009'],
            industry: industries[0]?.slug ?? 'general',
            tier: 1,
          })
        : null,
    });
  } catch (e) {
    console.error('[demo/loader]', e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : 'Failed to load demo catalog' },
      500,
    );
  }
}
