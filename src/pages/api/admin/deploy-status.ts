/**
 * GET /api/admin/deploy-status — module deployment catalog for this install (auth required).
 */
import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
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

export const prerender = false;

const POLL_MS = 30_000;


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

  const modules = listAllDeployModules().map((m) => {
    const navKeys = footerNavKeysForFeature(m.feature);
    const inFooterNav = isFeatureInFooterNav(m.feature, footerNav);
    const inDemoSuite =
      demoSuite != null ? demoSuite.features.includes(m.feature as FeatureId) : null;

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
      stage: m.stage,
      playbook: m.path || null,
      pluginId: m.pluginId,
      footerNavKeys: navKeys,
      footerNavLabels: footerNavKeyLabels(navKeys),
      inFooterNav,
      inDemoSuite,
      needsAttention: moduleNeedsAttention(m),
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
    footerNav,
    catalog: demoModuleCatalog(),
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
