/**
 * Public demo loader catalog — uses deploy-status feed; toggles only when status is deployed.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import type { FeatureId } from './featureCatalog';
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

export type DemoLoaderSection = {
  id: string;
  /** Section heading; null = no title block (ungrouped modules above named sections). */
  title: string | null;
  modules: DemoLoaderModule[];
};

/**
 * Named section groups for the public demo loader.
 * Features listed here are pulled out of the default list and rendered under the title
 * (in this array order). Everything else stays above with no title for later organization.
 */
export const DEMO_LOADER_SECTION_GROUPS: ReadonlyArray<{
  id: string;
  title: string;
  features: readonly FeatureId[];
}> = [
  {
    id: 'web-development',
    title: 'Web Development Modules',
    features: ['dev_infra', 'code_dev', 'namecom_dns', 'site_monitoring', 'wayback_machine'],
  },
];

/** Full module list for the public demo loader UI (baseline modules excluded). */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionFeatures = getProductionInstallFeatures();

  return listAllDeployModules()
    .map((m) => {
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
    })
    .filter((m) => !m.moduleId || !isDemoBaselineModuleId(m.moduleId));
}

/** Sectioned catalog: ungrouped modules first, then named groups at the bottom. */
export function listDemoLoaderSections(
  modules: readonly DemoLoaderModule[] = listDemoLoaderModules(),
): DemoLoaderSection[] {
  const byFeature = new Map(modules.map((m) => [m.feature, m]));
  const claimed = new Set<string>();

  const named: DemoLoaderSection[] = DEMO_LOADER_SECTION_GROUPS.map((group) => {
    const sectionModules: DemoLoaderModule[] = [];
    for (const feature of group.features) {
      const mod = byFeature.get(feature);
      if (!mod) continue;
      claimed.add(feature);
      sectionModules.push(mod);
    }
    return { id: group.id, title: group.title, modules: sectionModules };
  }).filter((s) => s.modules.length > 0);

  const ungrouped = modules.filter((m) => !claimed.has(m.feature));
  const sections: DemoLoaderSection[] = [];
  if (ungrouped.length) {
    sections.push({ id: 'ungrouped', title: null, modules: ungrouped });
  }
  sections.push(...named);
  return sections;
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
