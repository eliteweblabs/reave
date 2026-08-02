import type { APIContext } from 'astro';
import { TRADES } from '@reave/plugin-real-estate-data';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';
import { resolveScanCenter, runLeadScanner } from '../../../lib/leadScannerEngine';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { getDeploymentOwnerTimezone } from '../../../lib/deploymentOwner';
import {
  getLeadScannerConfig,
  listRecentLeadScannerRuns,
  saveLeadScannerConfig,
} from '../../../lib/leadScannerStore';
import { leadScannerStatusSummary } from '../../../lib/leadScannerScheduler';

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
  if (!hasFeature('real_estate_data')) {
    return json({ error: 'real_estate_data not enabled' }, 404);
  }

  const [config, runs, status, company, timezone] = await Promise.all([
    getLeadScannerConfig(),
    listRecentLeadScannerRuns(8),
    leadScannerStatusSummary(),
    getCompanyConfig(),
    getDeploymentOwnerTimezone(context),
  ]);
  const resolvedCenter = await resolveScanCenter(config);

  return json({
    ok: true,
    config,
    runs,
    status,
    resolvedCenter,
    timezone,
    companyGeo: company.geo ?? null,
    companyAddress: company.address ?? '',
    tradesCatalog: TRADES.map((t) => ({ slug: t.slug, label: t.label })),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('real_estate_data')) {
    return json({ error: 'real_estate_data not enabled' }, 404);
  }

  const action = context.url.searchParams.get('action')?.trim();
  if (action === 'scan') {
    const result = await runLeadScanner({ source: 'admin', force: true, ignoreWindow: true });
    return json({ ok: result.ok, result });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.centerLat != null) patch.centerLat = Number(body.centerLat);
  if (body.centerLng != null) patch.centerLng = Number(body.centerLng);
  if (body.radiusMiles != null) patch.radiusMiles = Number(body.radiusMiles);
  if (Array.isArray(body.trades)) patch.trades = body.trades.map(String);
  if (typeof body.useCompanyOffice === 'boolean') patch.useCompanyOffice = body.useCompanyOffice;
  if (body.scanHourLocal != null) patch.scanHourLocal = Number(body.scanHourLocal);

  const config = await saveLeadScannerConfig(patch);
  return json({ ok: true, config });
}
