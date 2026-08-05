/**
 * GET /api/admin/deploy-status — module deployment catalog for this install (auth required).
 */
import type { APIContext } from 'astro';
import { listAllDeployModules } from '../../../lib/deployModuleStatus';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

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

  const modules = listAllDeployModules().map((m) => ({
    id: m.feature,
    label: m.label,
    enabled: m.enabled,
    status: m.status,
    configured: m.configured,
    active: m.active,
    runtimeAllowed: m.runtimeAllowed,
    showBanner: m.showBanner,
    stage: m.stage,
    playbook: m.path || null,
  }));

  return json({
    ok: true,
    modules,
    undeployed: modules.filter((m) => m.enabled && m.showBanner),
  });
}
