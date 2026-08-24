/**
 * GET /api/demo/loader — public demo loader catalog (modules + features + industries).
 */
import type { APIContext } from 'astro';
import { listEnabledDeckIndustries } from '../../../lib/deckIndustriesStore';
import {
  defaultDemoLoaderModuleIds,
  listDemoLoaderIncludedCards,
  listDemoLoaderMarketingFeatures,
  listDemoLoaderModules,
} from '../../../lib/demoLoaderCatalog';
import {
  overlayDemoModule,
  overlayIncludedCard,
  sectionsFromCatalog,
} from '../../../lib/moduleCatalogOverlay';
import { ensureModuleCatalogLoaded } from '../../../lib/moduleCatalogStore';
import { buildDemoSuiteUrl, parseDemoSuiteCookie, DEMO_SUITE_COOKIE } from '../../../lib/demoSuite';
import { checkDemoLoaderCatalogRateLimit } from '../../../lib/demoLaunch';
import { DEMO_BASELINE_MODULE_IDS, demoModuleIdForFeature, mergeDemoModuleIds } from '../../../lib/demoModuleCatalog';
import { getPublicDemoSiteUrl } from '../../../lib/publicDemo';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { isStaffSession } from '../../../lib/staffSession';

export const prerender = false;

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {}),
    },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const rate = checkDemoLoaderCatalogRateLimit(context.request);
    if (!rate.ok) {
      return json(
        { ok: false, error: 'Too many requests. Please try again shortly.' },
        429,
        { 'Retry-After': String(rate.retryAfterSeconds) },
      );
    }

    await ensureModuleCatalogLoaded();
    const modules = listDemoLoaderModules().map(overlayDemoModule);
    const sections = sectionsFromCatalog(modules);
    const included = listDemoLoaderIncludedCards().map(overlayIncludedCard);
    const features = listDemoLoaderMarketingFeatures();
    const industries = await listEnabledDeckIndustries();
    const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);
    const demoSiteUrl = getPublicDemoSiteUrl();

    return json({
      ok: true,
      canEditCatalog: isCanonicalReaveInstall() && isStaffSession(context.locals),
      modules,
      sections,
      included,
      /** Culled marketing features; each lists module FeatureIds it depends on. */
      features,
      baselineModuleIds: [...DEMO_BASELINE_MODULE_IDS],
      industries: industries
        .map((i) => ({ slug: i.slug, label: i.label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
      defaultModuleIds: defaultDemoLoaderModuleIds(modules),
      suite: cookieSuite,
      demoSiteUrl,
      exampleLaunchUrl: demoSiteUrl
        ? buildDemoSuiteUrl(demoSiteUrl, {
            moduleIds: mergeDemoModuleIds([
              demoModuleIdForFeature('site_monitoring'),
              demoModuleIdForFeature('voice'),
            ]),
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
