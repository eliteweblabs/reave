/**
 * Public demo loader catalog — all modules; toggles only when deployed on production Reave.
 */
import { demoModuleIdForFeature } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import {
  getProductionInstallConfig,
  type InstallFeatureId,
} from './installConfig';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  /** Deploy status on production Reave (null when not on that install). */
  status: ModuleDeployStatus | null;
  /** Enabled on production Reave (config-reave.json features[]). */
  inProduction: boolean;
  /** Ready for demo — deployed and live on production Reave. */
  toggleable: boolean;
};

function productionStatusForFeature(
  feature: InstallFeatureId,
  config: ReturnType<typeof getProductionInstallConfig>,
): ModuleDeployStatus | null {
  if (!config?.features.includes(feature)) return null;
  const override = config.moduleStatus?.[feature];
  if (override) return override;
  // config-reave.json omits moduleStatus — enabled modules are live.
  return 'deployed';
}

/** Full module list for the public demo loader UI. */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionConfig = getProductionInstallConfig();
  const productionFeatures = productionConfig
    ? new Set(productionConfig.features.filter((f) => f !== 'demo'))
    : new Set<InstallFeatureId>();

  return listAllDeployModules().map((m) => {
    const prodStatus = productionStatusForFeature(m.feature, productionConfig);
    const inProduction = productionFeatures.has(m.feature);
    return {
      moduleId: demoModuleIdForFeature(m.feature),
      feature: m.feature,
      label: m.label,
      status: prodStatus ?? m.status,
      inProduction,
      toggleable: prodStatus === 'deployed' && Boolean(demoModuleIdForFeature(m.feature)),
    };
  });
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
