/**
 * Deployment feature modules — baseline in config/config-{slug}.json, runtime
 * changes via Add-ons toggles (Postgres feature_overrides).
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
  expandFeatureRequirements,
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
  expandFeatureRequirements,
  featureVisibility,
  isDeployableFeature,
  isPrivateFeature,
  isPublicFeature,
  isServiceFeature,
  type FeatureId,
  type FeatureVisibility,
};

let _baseCached: Set<FeatureId> | null = null;
let _featuresEnvWarned = false;

function warnDeprecatedFeaturesEnv(): void {
  if (_featuresEnvWarned) return;
  const raw = serverEnv('FEATURES')?.trim();
  if (!raw) return;
  _featuresEnvWarned = true;
  log.warn(
    'FEATURES env is deprecated and ignored — use config/config-{slug}.json features[] and Add-ons toggles',
  );
}

function bootstrapEnabled(): Set<FeatureId> {
  warnDeprecatedFeaturesEnv();
  const fromInstall = getInstallConfigSync().features;
  if (fromInstall.length) {
    return new Set<FeatureId>(fromInstall);
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
  if (isDemoMode()) return new Set(expandFeatureRequirements(demoEnabledFeatures()));
  if (!_baseCached) _baseCached = bootstrapEnabled();
  return new Set(expandFeatureRequirements(applyFeatureOverrides(_baseCached)));
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

/** Client Website module, or the standalone Ideogram add-on. */
export function hasIdeogramImageGen(): boolean {
  return hasFeature('website') || hasFeature('ideogram');
}

/** Paid e-sign add-on — requires Dynamic Documents plus digital_signature. */
export function hasDigitalSignature(): boolean {
  return hasFeature('documents') && hasFeature('digital_signature');
}

/** Admin Inbox tab, inbound triage, and in-app compose from contacts. */
export function hasEmailInbox(): boolean {
  return hasFeature('email_inbox');
}

export function hasSchedulingModule(): boolean {
  return hasFeature('scheduling');
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _baseCached = null;
}

export function refreshFeatureCache(): void {
  _baseCached = bootstrapEnabled();
}
