/**
 * GET  /api/admin/social-lead-scanner — config, hits, summary
 * POST /api/admin/social-lead-scanner — save config, scan, update hit
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { accountsFromCompany } from '../../../lib/social/accounts';
import { SOCIAL_PLATFORM_CATALOG } from '../../../lib/social/platforms';
import { runSocialLeadScanner } from '../../../lib/socialLeadScannerEngine';
import {
  ensureSocialLeadScannerScheduler,
  socialLeadScannerSchedulerStatus,
} from '../../../lib/socialLeadScannerScheduler';
import {
  getSocialLeadScannerConfig,
  listSocialLeadScannerHits,
  parseSocialLeadKeywords,
  saveSocialLeadScannerConfig,
  socialLeadScannerSummary,
  updateSocialLeadScannerHit,
  SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS,
} from '../../../lib/socialLeadScannerStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

function featureGate(): Response | null {
  if (!hasFeature('social_lead_scanner')) {
    return jsonResponse({ error: 'social_lead_scanner not enabled' }, 404);
  }
  return null;
}

function platformOptions(configured: Set<string>) {
  return SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS.map((id) => {
    const cat = SOCIAL_PLATFORM_CATALOG.find((p) => p.id === id);
    return {
      id,
      label: cat?.label ?? id,
      configured: configured.has(id),
    };
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const blocked = featureGate();
  if (blocked) return blocked;

  ensureSocialLeadScannerScheduler();

  const statusParam = context.url.searchParams.get('status')?.trim() || 'inbox';
  const filterStatus = statusParam === 'all' ? undefined : statusParam === 'inbox' ? 'inbox' : statusParam;

  const [config, summary, hits, scheduler, company] = await Promise.all([
    getSocialLeadScannerConfig(),
    socialLeadScannerSummary(),
    listSocialLeadScannerHits({ status: filterStatus as 'inbox' | undefined, limit: 200 }),
    socialLeadScannerSchedulerStatus(),
    getCompanyConfig(context.request),
  ]);

  const accounts = accountsFromCompany(company);
  const configured = new Set(accounts.map((a) => a.platform));

  return jsonResponse({
    ok: true,
    config,
    summary,
    hits,
    scheduler,
    platformOptions: platformOptions(configured),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const blocked = featureGate();
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();

  if (action === 'save_config') {
    const keywords =
      body.keywords !== undefined
        ? parseSocialLeadKeywords(body.keywords)
        : undefined;
    const platforms = Array.isArray(body.platforms)
      ? body.platforms.map(String)
      : undefined;
    const config = await saveSocialLeadScannerConfig({
      enabled: body.enabled !== undefined ? !!body.enabled : undefined,
      keywords,
      platforms,
      autoDraft: body.autoDraft !== undefined ? !!body.autoDraft : undefined,
    });
    ensureSocialLeadScannerScheduler();
    return jsonResponse({ ok: true, config });
  }

  if (action === 'scan') {
    const result = await runSocialLeadScanner({ source: 'admin', force: true });
    const [config, summary, hits] = await Promise.all([
      getSocialLeadScannerConfig(),
      socialLeadScannerSummary(),
      listSocialLeadScannerHits({ status: 'inbox', limit: 200 }),
    ]);
    return jsonResponse({ ok: true, result, config, summary, hits });
  }

  if (action === 'update') {
    const id = String(body.id ?? '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    const statusRaw = body.status != null ? String(body.status) : undefined;
    const status =
      statusRaw === 'new' ||
      statusRaw === 'todo' ||
      statusRaw === 'responded' ||
      statusRaw === 'dismissed'
        ? statusRaw
        : undefined;
    const hit = await updateSocialLeadScannerHit(id, {
      status,
      replyDraft: body.replyDraft !== undefined ? String(body.replyDraft ?? '') : undefined,
    });
    if (!hit) return jsonResponse({ error: 'Hit not found' }, 404);
    const summary = await socialLeadScannerSummary();
    return jsonResponse({ ok: true, hit, summary });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}
