/**
 * GET  /api/admin/demo — demo setup status (any signed-in admin)
 * POST /api/admin/demo — run demo seed (deployment owner only)
 */
import type { APIContext } from 'astro';
import { getDemoSetupStatus, isDemoMode } from '../../../../lib/demoMode';
import { runDemoSeed } from '../../../../lib/demoSeedRunner';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  if (!hasFeature('demo')) {
    return json({
      ok: true,
      enabled: false,
      note: 'Demo plugin not enabled — set INSTALL_CONFIG=demo or add "demo" to install features',
    });
  }

  const status = await getDemoSetupStatus();
  return json({ ok: true, enabled: true, ...status });
}

export async function POST(context: APIContext): Promise<Response> {
  const owner = await requireDeploymentOwner(context);
  if (owner instanceof Response) return owner;

  if (!hasFeature('demo')) {
    return json({ error: 'Demo plugin not enabled on this install' }, 403);
  }
  if (!isDemoMode()) {
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

  const result = runDemoSeed({
    fresh: body.fresh === true,
    forceCompany: body.forceCompany === true || body.force_company === true,
    withBookings: body.withBookings === true || body.with_bookings === true,
    dryRun,
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
