/**
 * Feature module list — sourced from per-install JSON (see installConfig.ts).
 * @deprecated Use getInstallConfig() directly; this module remains for callers that expect async read.
 */
import { getInstallConfigSync } from './installConfig';
import type { FeatureId } from './features';

export function readStoredFeaturesSync(): FeatureId[] | null {
  const features = getInstallConfigSync().features;
  return features.length ? features : null;
}

export async function getStoredFeatures(): Promise<FeatureId[] | null> {
  return readStoredFeaturesSync();
}

export function featureStorageBackend(): 'install-config' {
  return 'install-config';
}

export function clearStoredFeaturesCache(): void {
  // no-op — install config cache cleared via clearInstallConfigCache()
}
