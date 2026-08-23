/**
 * GET /api/admin/deploy-status — module deployment catalog for this install (auth required).
 */
import type { APIContext } from 'astro';
import { demoModuleIdForFeature } from '../../../lib/demoModuleCatalog';
import { listAllDeployModules } from '../../../lib/deployModuleStatus';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getInstallConfigClient } from '../../../lib/installConfig';
import { isDemoMode } from '../../../lib/demoMode';
import {
  DEMO_SUITE_COOKIE,
  demoModuleCatalog,
  demoSuiteSummary,
  parseDemoSuiteCookie,
} from '../../../lib/demoSuite';
import {
  footerNavKeyLabels,
  footerNavKeysForFeature,
  isFeatureInFooterNav,
} from '../../../lib/moduleNavMap';
import type { FeatureId } from '../../../lib/featureCatalog';
import { listModuleEntitlements } from '../../../lib/moduleEntitlements';
import {
  formatModulePrice,
  isPaidModule,
  modulePrice,
  moduleStorefrontEnabled,
} from '../../../lib/moduleStorefront';
import { isDeploymentOwner } from '../../../lib/deploymentOwner';
import {
  MODULE_DISPLAY_GROUPS,
  moduleDisplayGroupFor,
} from '../../../lib/moduleDisplayGroups';

export const prerender = false;

const POLL_MS = 30_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function moduleNeedsAttention(m: {
  enabled: boolean;
  showBanner: boolean;
  configured: boolean;
  runtimeAllowed: boolean;
  active: boolean;
}): boolean {
  if (!m.enabled) return false;
  if (m.showBanner) return true;
  if (!m.configured) return true;
  if (!m.runtimeAllowed) return true;
  return !m.active;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const install = getInstallConfigClient();
  const footerNav = install.footerNav ?? [];
  const demoMode = isDemoMode();
  const demoSuite = demoMode
    ? parseDemoSuiteCookie(context.cookies.get(DEMO_SUITE_COOKIE)?.value)
    : null;

  const [entitlements, owner] = await Promise.all([
    listModuleEntitlements(),
    isDeploymentOwner(context),
  ]);
  const entitlementByFeature = new Map(entitlements.map((e) => [e.feature, e]));
  const storefront = moduleStorefrontEnabled();

  const modules = listAllDeployModules().map((m) => {
    const navKeys = footerNavKeysForFeature(m.feature);
    const inFooterNav = isFeatureInFooterNav(m.feature, footerNav);
    const inDemoSuite =
      demoSuite != null ? demoSuite.features.includes(m.feature as FeatureId) : null;

    const price = modulePrice(m.feature);
    const entitlement = entitlementByFeature.get(m.feature) ?? null;
    const purchasable = storefront && isPaidModule(m.feature) && !m.enabled;

    return {
      moduleId: demoModuleIdForFeature(m.feature),
      feature: m.feature,
      label: m.label,
      enabled: m.enabled,
      status: m.status,
      configured: m.configured,
      active: m.active,
      runtimeAllowed: m.runtimeAllowed,
      showBanner: m.showBanner,
      visibility: m.visibility,
      saleSheet: m.saleSheet,
      stage: m.stage,
      playbook: m.path || null,
      pluginId: m.pluginId,
      footerNavKeys: navKeys,
      footerNavLabels: footerNavKeyLabels(navKeys),
      inFooterNav,
      inDemoSuite,
      needsAttention: moduleNeedsAttention(m),
      purchasable,
      price: price ? { ...price, label: formatModulePrice(price) } : null,
      entitlement,
      group: moduleDisplayGroupFor(m.feature),
    };
  });

  const enabled = modules.filter((m) => m.enabled);
  const needsAttention = modules.filter((m) => m.needsAttention);

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    pollMs: POLL_MS,
    demoMode,
    demoSuite: demoSuite
      ? {
          ...demoSuite,
          summary: demoSuiteSummary(demoSuite),
        }
      : null,
    storefront,
    canMarkPaid: owner,
    footerNav,
    catalog: demoModuleCatalog(),
    groups: MODULE_DISPLAY_GROUPS.map((g) => ({
      id: g.id,
      title: g.title,
      features: [...g.features],
    })),
    summary: {
      total: modules.length,
      enabled: enabled.length,
      deployed: enabled.filter((m) => m.status === 'deployed').length,
      development: enabled.filter((m) => m.status === 'development').length,
      needsAttention: needsAttention.length,
    },
    modules,
    undeployed: modules.filter((m) => m.enabled && m.showBanner),
  });
}
