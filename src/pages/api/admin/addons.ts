/**
 * GET /api/admin/addons — add-on catalog for account → Add-ons.
 * POST /api/admin/addons — owner toggle or client request.
 */
import type { APIContext } from 'astro';
import { buildAddonsCatalog } from '../../../lib/addonsCatalog';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  getAuthUser,
  isDeploymentOwner,
  requireDeploymentOwner,
} from '../../../lib/deploymentOwner';
import {
  ensureFeatureOverridesLoaded,
  hasFeature,
  refreshFeatureCache,
} from '../../../lib/features';
import { isDemoMode } from '../../../lib/demoMode';
import {
  isFeatureId,
  listModuleEntitlements,
  upsertModuleEntitlement,
} from '../../../lib/moduleEntitlements';
import { isOpsInstall } from '../../../lib/installConfig';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { FEATURE_LABELS, isPrivateFeature, type FeatureId } from '../../../lib/featureCatalog';
import { postToSystemAlertsThread } from '../../../lib/adminAgentAlert';
import {
  catalogLabel,
  resolvedIsPaidModule,
  resolvedModulePrice,
} from '../../../lib/moduleCatalogOverlay';
import { ensureModuleCatalogLoaded } from '../../../lib/moduleCatalogStore';
import { formatModulePrice } from '../../../lib/moduleStorefront';
import { setFeatureOverride } from '../../../lib/featureOverridesStore';

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

  if (isDemoMode()) {
    return json({ ok: false, error: 'Add-ons are disabled in demo mode.' }, 400);
  }

  await ensureFeatureOverridesLoaded();
  await ensureModuleCatalogLoaded();
  const owner = await isDeploymentOwner(context);
  const entitlements = await listModuleEntitlements();
  const entitlementByFeature = new Map(entitlements.map((e) => [e.feature, e]));
  const catalog = buildAddonsCatalog({ owner, entitlements: entitlementByFeature });

  return json({
    ok: true,
    owner,
    opsInstall: isOpsInstall(),
    mode: owner ? 'toggle' : 'request',
    ...catalog,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (isDemoMode()) {
    return json({ ok: false, error: 'Add-ons are disabled in demo mode.' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();
  const featureRaw = String(body.feature ?? '').trim();
  if (!isFeatureId(featureRaw)) return json({ ok: false, error: 'Unknown module.' }, 400);
  const feature = featureRaw as FeatureId;

  await ensureFeatureOverridesLoaded();
  await ensureModuleCatalogLoaded();

  if (action === 'toggle') {
    const owner = await requireDeploymentOwner(context);
    if (owner instanceof Response) return owner;

    const enabled = body.enabled === true || body.enabled === 'true';
    await setFeatureOverride(feature, enabled);
    refreshFeatureCache();

    const label = catalogLabel(feature, FEATURE_LABELS[feature]);
    await postToSystemAlertsThread({
      message: `Add-on toggled: **${label}** (\`${feature}\`) → ${enabled ? 'ON' : 'OFF'} (runtime override). Config features[] unchanged until deploy.`,
      bypassSleep: true,
      push: {
        title: `${enabled ? 'On' : 'Off'}: ${label}`,
        body: 'Runtime add-on override',
        url: '/admin/?tab=addons',
        urgent: false,
      },
    }).catch(() => undefined);

    return json({ ok: true, feature, enabled, active: hasFeature(feature) });
  }

  if (action === 'request') {
    const owner = await requireDeploymentOwner(context);
    if (!(owner instanceof Response)) {
      return json({ ok: false, error: 'Owners toggle add-ons directly — use action toggle.' }, 400);
    }

    if (isPrivateFeature(feature) || !resolvedIsPaidModule(feature)) {
      return json({ ok: false, error: 'That add-on is not available for self-serve request.' }, 400);
    }
    if (hasFeature(feature)) {
      return json({ ok: false, error: 'This add-on is already active on your install.' }, 400);
    }

    const price = resolvedModulePrice(feature);
    if (!price) return json({ ok: false, error: 'No price on file.' }, 400);
    const label = catalogLabel(feature, FEATURE_LABELS[feature]);
    const company = await getCompanyConfig(context.request);
    const user = await getAuthUser(context);
    const requester =
      user?.emailAddresses?.[0]?.emailAddress?.trim() ||
      user?.username?.trim() ||
      'Signed-in user';

    const entitlement = await upsertModuleEntitlement({
      feature,
      status: 'requested',
      amount: price.amount,
      notes: 'Requested from account → Add-ons. Alert-only — no invoice yet.',
    });

    await postToSystemAlertsThread({
      message: [
        `Add-on request: **${label}** (\`${feature}\`) · ${formatModulePrice(price)}`,
        `${company.name} · requested by ${requester}`,
        'No auto-charge yet — follow up for payment, then enable features[] on deploy.',
      ].join('\n'),
      bypassSleep: true,
      push: {
        title: `Add-on: ${label}`,
        body: `${company.name} · ${formatModulePrice(price)}`,
        url: '/admin/?tab=addons',
        urgent: true,
      },
    }).catch(() => undefined);

    return json({ ok: true, entitlement, requested: true });
  }

  return json({ ok: false, error: 'Unknown action' }, 400);
}
