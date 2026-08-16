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
  isPrivateFeature,
  isPublicFeature,
  type FeatureId,
  type FeatureVisibility,
} from './featureCatalog.ts';
import { serverEnv } from './serverEnv';
import { createLogger } from './logger';

const log = createLogger('features');

export {
  CORE_FEATURE_NOTE,
  FEATURE_BLURBS,
  FEATURE_IDS,
  FEATURE_LABELS,
  featureVisibility,
  isPrivateFeature,
  isPublicFeature,
  type FeatureId,
  type FeatureVisibility,
};

let _cached: Set<FeatureId> | null = null;

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
  if (fromInstall.length) return new Set(fromInstall);
  return parseFeaturesEnv();
}

/** Enabled optional modules for this deployment. */
export function enabledFeatures(): ReadonlySet<FeatureId> {
  if (isDemoMode()) return demoEnabledFeatures();
  if (!_cached) _cached = bootstrapEnabled();
  return _cached;
}

export function hasFeature(id: FeatureId): boolean {
  if (isDemoMode()) return demoHasFeature(id);
  return enabledFeatures().has(id);
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _cached = null;
}
