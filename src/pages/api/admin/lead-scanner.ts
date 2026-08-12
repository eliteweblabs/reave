import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { TRADES, loadConfig } from '@reave/plugin-real-estate-data';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';
import {
  importLeadScannerCandidates,
  resolveScanCenter,
  runLeadScanner,
} from '../../../lib/leadScannerEngine';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { getViolationServiceAreaSummary } from '../../../lib/violationsContext';
import { getDeploymentOwnerTimezone } from '../../../lib/deploymentOwner';
import {
  getLatestLeadScannerRun,
  getLeadScannerConfig,
  getLeadScannerRun,
  listImportedLeads,
  listRecentLeadScannerRuns,
  saveLeadScannerConfig,
} from '../../../lib/leadScannerStore';
import { leadScannerStatusSummary } from '../../../lib/leadScannerScheduler';

export const prerender = false;


async function runWithImports(runId: string | null) {
  if (!runId) return null;
  const run = await getLeadScannerRun(runId, true);
  if (!run) return null;
  const propertyIds = (run.candidates ?? []).map((c) => c.id);
  const imported = propertyIds.length ? await listImportedLeads(propertyIds) : [];
  const importedById = Object.fromEntries(imported.map((row) => [row.propertyId, row]));
  return { ...run, importedById };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('real_estate_data')) {
    return json({ error: 'real_estate_data not enabled' }, 404);
  }

  const runId = context.url.searchParams.get('runId')?.trim() || null;

  const [config, runs, status, company, timezone, violationServiceArea] = await Promise.all([
    getLeadScannerConfig(),
    listRecentLeadScannerRuns(8),
    leadScannerStatusSummary(),
    getCompanyConfig(),
    getDeploymentOwnerTimezone(context),
    getViolationServiceAreaSummary(),
  ]);
  const resolvedCenter = await resolveScanCenter(config);
  const activeRun = runId
    ? await runWithImports(runId)
    : await runWithImports((await getLatestLeadScannerRun(false))?.id ?? null);

  return json({
    ok: true,
    config,
    runs,
    status,
    resolvedCenter,
    timezone,
    companyGeo: company.geo ?? null,
    companyAddress: company.address ?? '',
    violationServiceArea,
    dataProvider: loadConfig().provider,
    tradesCatalog: TRADES.map((t) => ({ slug: t.slug, label: t.label })),
    activeRun,
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

  if (action === 'import') {
    let body: Record<string, unknown> = {};
    try {
      body = (await context.request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const runId = String(body.runId ?? '').trim();
    const propertyIds = Array.isArray(body.propertyIds) ? body.propertyIds.map(String) : [];
    if (!runId) return json({ error: 'runId is required' }, 400);
    if (!propertyIds.length) return json({ error: 'propertyIds is required' }, 400);

    const result = await importLeadScannerCandidates({ runId, propertyIds });
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
