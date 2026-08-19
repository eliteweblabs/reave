/**
 * GET  /api/admin/demo — demo setup status (any signed-in admin)
 * POST /api/admin/demo — run demo seed (deployment owner only)
 */
import type { APIContext } from 'astro';
import { getDemoSetupStatus, isDemoMode } from '../../../../lib/demoMode';
import { runDemoSeed } from '../../../../lib/demoSeedRunner';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { hasFeature } from '../../../../lib/features';
import {
  parseDemoSuiteCookie,
  serializeDemoSuite,
  type DemoSuiteConfig,
} from '../../../../lib/demoSuite';
import { DEMO_SUITE_COOKIE, DEMO_SUITE_COOKIE_MAX_AGE } from '../../../../lib/demoSuite';
import { shouldSeedOnBoot } from '../../../../lib/installSeed';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('demo')) {
    return json({
      ok: true,
      enabled: false,
      note: 'Demo plugin not enabled — set INSTALL_CONFIG=demo or add "demo" to install features',
    });
  }

  const status = await getDemoSetupStatus();
  const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);
  return json({ ok: true, enabled: true, ...status, suite: cookieSuite });
}

export async function POST(context: APIContext): Promise<Response> {
  const owner = await requireDeploymentOwner(context);
  if (owner instanceof Response) return owner;

  if (!hasFeature('demo') && !shouldSeedOnBoot()) {
    return json({ error: 'Demo plugin not enabled on this install' }, 403);
  }
  if (!isDemoMode() && !shouldSeedOnBoot()) {
    return json(
      { error: 'Demo mode is not active (set DEMO_MODE=1 or INSTALL_CONFIG=demo)' },
      403,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const dryRun = body.dryRun === true || body.dry_run === true;
  if (!dryRun) {
    const status = await getDemoSetupStatus();
    if (!status.readyToSeed) {
      return json(
        {
          error: 'Demo seed prerequisites not met',
          checks: status.checks.filter((c) => !c.ok),
        },
        400,
      );
    }
  }

  const cookieSuite = parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value);
  const bodySuite = body.suite as DemoSuiteConfig | undefined;
  const suite = bodySuite?.moduleIds?.length ? bodySuite : cookieSuite;

  const result = runDemoSeed({
    fresh: body.fresh === true,
    forceCompany: body.forceCompany === true || body.force_company === true,
    withBookings: body.withBookings === true || body.with_bookings === true,
    dryRun,
    industry: (body.industry as string) ?? suite?.industry,
    moduleIds: (body.moduleIds as string[]) ?? suite?.moduleIds,
    tier: (body.tier as number) ?? suite?.tier,
    visitorName: (body.visitorName as string) ?? suite?.visitorName,
    visitorEmail: (body.visitorEmail as string) ?? suite?.visitorEmail,
  });

  if (!result.ok) {
    return json(
      {
        error: result.error,
        stdout: result.stdout?.slice(-2000),
        stderr: result.stderr?.slice(-2000),
      },
      500,
    );
  }

  const statusAfter = dryRun ? null : await getDemoSetupStatus();
  return json({
    ok: true,
    dryRun,
    stdout: result.stdout.slice(-4000),
    status: statusAfter,
  });
}
