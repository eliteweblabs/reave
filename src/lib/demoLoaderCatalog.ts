/**
 * Public demo loader catalog — uses deploy-status feed; toggles only when status is deployed.
 */
import { demoModuleIdForFeature } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import { getProductionInstallFeatures, type InstallFeatureId } from './installConfig';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  status: ModuleDeployStatus;
  /** Enabled on production Reave (config-reave.json features[]). */
  inProduction: boolean;
  /** Ready for demo — deploy playbook status is deployed. */
  toggleable: boolean;
};

/** Full module list for the public demo loader UI. */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionFeatures = getProductionInstallFeatures();

  return listAllDeployModules().map((m) => {
    const moduleId = demoModuleIdForFeature(m.feature);
    const deployed = m.status === 'deployed';
    return {
      moduleId,
      feature: m.feature,
      label: m.label,
      status: m.status,
      inProduction: productionFeatures.has(m.feature),
      toggleable: deployed && Boolean(moduleId),
    };
  });
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
