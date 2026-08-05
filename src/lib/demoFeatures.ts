/**
 * Demo install feature gating — driven by URL suite cookie (or default), not config-demo.json features[].
 */
import { getActiveDemoSuite } from './demoSuiteContext';
import { DEFAULT_DEMO_SUITE } from './demoSuite';
import type { FeatureId } from './featureCatalog';
import type { ModuleDeployStatus } from './installConfig';

export function activeDemoSuite() {
  return getActiveDemoSuite() ?? DEFAULT_DEMO_SUITE;
}

/** Enabled optional modules for this demo request (always includes demo). */
export function demoEnabledFeatures(): ReadonlySet<FeatureId> {
  const suite = activeDemoSuite();
  const out = new Set<FeatureId>(['demo']);
  for (const f of suite.features) {
    if (f !== 'demo') out.add(f);
  }
  return out;
}

export function demoHasFeature(id: FeatureId): boolean {
  return demoEnabledFeatures().has(id);
}

/** Per-module deploy status derived from the active suite (no config-demo.json moduleStatus). */
export function demoModuleDeployStatus(feature: FeatureId): ModuleDeployStatus {
  if (feature === 'demo') return 'development';
  if (!demoHasFeature(feature)) return 'rejected';
  return 'pending';
}

export function demoShouldShowDeployBanner(feature: FeatureId): boolean {
  if (!demoHasFeature(feature)) return false;
  const status = demoModuleDeployStatus(feature);
  return status !== 'deployed' && status !== 'rejected';
}
