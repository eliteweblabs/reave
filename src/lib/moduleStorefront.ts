/**
 * Paid add-on catalog for in-app module purchase.
 *
 * Install config `features[]` is still what ships on deploy.
 * Clients request add-ons from account → Add-ons; owner enables after payment.
 * Deployment owners can runtime-toggle via feature overrides (Postgres).
 */
import type { FeatureId } from './featureCatalog.ts';
import { FEATURE_BLURBS, FEATURE_LABELS, isPrivateFeature, isServiceFeature } from './featureCatalog.ts';
import { isDemoBaselineModuleId, demoModuleIdForFeature } from './demoModuleCatalog.ts';
import { isOpsInstall } from './installConfig.ts';
import { PAID_MODULE_PRICES, type ModulePrice } from './paidModulePrices.ts';

export type { ModulePrice } from './paidModulePrices.ts';
export { PAID_MODULE_PRICES } from './paidModulePrices.ts';

export function isPaidModule(feature: FeatureId): boolean {
  const price = PAID_MODULE_PRICES[feature];
  if (!price || price.amount <= 0) return false;
  if (isPrivateFeature(feature) || isServiceFeature(feature)) return false;
  const moduleId = demoModuleIdForFeature(feature);
  if (moduleId && isDemoBaselineModuleId(moduleId)) return false;
  return true;
}

export function isCatalogModule(feature: FeatureId): boolean {
  const moduleId = demoModuleIdForFeature(feature);
  if (moduleId && isDemoBaselineModuleId(moduleId)) return false;
  return Boolean(PAID_MODULE_PRICES[feature]);
}

export function modulePrice(feature: FeatureId): ModulePrice | null {
  return PAID_MODULE_PRICES[feature] ?? null;
}

export function formatModulePrice(price: ModulePrice): string {
  const dollars = Number.isInteger(price.amount) ? String(price.amount) : price.amount.toFixed(2);
  if (price.amount <= 0) return 'Included';
  if (price.interval === 'once') return `$${dollars}`;
  return `$${dollars}/${price.interval === 'month' ? 'mo' : price.interval}`;
}

export function moduleOfferCopy(feature: FeatureId): string {
  return FEATURE_BLURBS[feature] || FEATURE_LABELS[feature];
}

/** Clients can request paid add-ons. Ops installs use owner toggles instead of self-purchase. */
export function moduleStorefrontEnabled(): boolean {
  return !isOpsInstall();
}
