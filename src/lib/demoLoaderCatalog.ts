/**
 * Public demo loader catalog — all modules with production toggle eligibility.
 */
import { demoModuleIdForFeature } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  status: ModuleDeployStatus;
  inProduction: boolean;
};

/** Full module list for the public demo loader UI. */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const production = getProductionInstallFeatures();
  return listAllDeployModules().map((m) => ({
    moduleId: demoModuleIdForFeature(m.feature),
    feature: m.feature,
    label: m.label,
    status: m.status,
    inProduction: production.has(m.feature),
  }));
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.inProduction && m.moduleId).map((m) => m.moduleId);
}
