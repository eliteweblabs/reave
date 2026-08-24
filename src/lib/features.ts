/**
 * Deployment feature modules — configured per install in config/config-{slug}.json.
 *
 * Legacy fallback: FEATURES env JSON array when install config has no features.
 */
import { getInstallConfigSync } from './installConfig.ts';
import { demoEnabledFeatures, demoHasFeature } from './demoFeatures.ts';
import { isDemoMode } from './demoMode.ts';
import {
  CORE_FEATURE_NOTE,
  FEATURE_BLURBS,
  FEATURE_ID_SET,
  FEATURE_IDS,
  FEATURE_LABELS,
  featureVisibility,
  isDeployableFeature,
  isPrivateFeature,
  isPublicFeature,
  isServiceFeature,
  type FeatureId,
  type FeatureVisibility,
} from './featureCatalog.ts';
import { featureOverrideCache, loadFeatureOverrides } from './featureOverridesStore.ts';
import { serverEnv } from './serverEnv';
import { createLogger } from './logger';

const log = createLogger('features');

export {
  CORE_FEATURE_NOTE,
  FEATURE_BLURBS,
  FEATURE_IDS,
  FEATURE_LABELS,
  featureVisibility,
  isDeployableFeature,
  isPrivateFeature,
  isPublicFeature,
  isServiceFeature,
  type FeatureId,
  type FeatureVisibility,
};

let _baseCached: Set<FeatureId> | null = null;

function parseFeaturesEnv(): Set<FeatureId> {
  const raw = serverEnv('FEATURES')?.trim();
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      log.warn('FEATURES must be a JSON array — ignoring');
      return new Set();
    }
    const out = new Set<FeatureId>();
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const id = item.trim();
      if (FEATURE_ID_SET.has(id)) out.add(id as FeatureId);
    }
    return out;
  } catch {
    log.warn('FEATURES is not valid JSON — ignoring');
    return new Set();
  }
}

function bootstrapEnabled(): Set<FeatureId> {
  const fromInstall = getInstallConfigSync().features;
  const fromEnv = parseFeaturesEnv();
  if (fromInstall.length || fromEnv.size) {
    return new Set<FeatureId>([...fromInstall, ...fromEnv]);
  }
  return new Set();
}

function applyFeatureOverrides(base: Set<FeatureId>): Set<FeatureId> {
  const overrides = featureOverrideCache();
  if (!overrides.size) return base;
  const out = new Set(base);
  for (const [feature, enabled] of overrides) {
    if (enabled) out.add(feature);
    else out.delete(feature);
  }
  return out;
}

/** Load Postgres overrides — call from admin routes before reading features. */
export async function ensureFeatureOverridesLoaded(): Promise<void> {
  if (isDemoMode()) return;
  await loadFeatureOverrides();
}

/** Enabled optional modules for this deployment. */
export function enabledFeatures(): ReadonlySet<FeatureId> {
  if (isDemoMode()) return demoEnabledFeatures();
  if (!_baseCached) _baseCached = bootstrapEnabled();
  return applyFeatureOverrides(_baseCached);
}

export function hasFeature(id: FeatureId): boolean {
  if (isDemoMode()) return demoHasFeature(id);
  return enabledFeatures().has(id);
}

/** Client Website module, or the editor flag it bundles. */
export function hasWebsiteEditor(): boolean {
  return hasFeature('website') || hasFeature('content_management');
}

/** Client Website module, or the standalone stock-photos flag. */
export function hasStockPhotoSearch(): boolean {
  return hasFeature('website') || hasFeature('stock_photos');
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _baseCached = null;
}

export function refreshFeatureCache(): void {
  _baseCached = bootstrapEnabled();
}
