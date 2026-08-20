/**
 * Paid add-on catalog for in-app module purchase.
 *
 * Install config `features[]` is still what *you* turn on after a sale.
 * Clients buy or request from admin → Modules; they cannot enable a module
 * themselves. Official / ops installs already have whatever you shipped.
 */
import type { FeatureId } from './featureCatalog.ts';
import { FEATURE_BLURBS, FEATURE_LABELS, isPrivateFeature } from './featureCatalog.ts';
import { isOpsInstall } from './installConfig.ts';

export type ModulePrice = {
  amount: number;
  interval: 'month';
  currency: 'usd';
};

/** Add-ons sold from the Modules tab. Private/ops modules are never listed. */
export const PAID_MODULE_PRICES: Partial<Record<FeatureId, ModulePrice>> = {
  social_inbox: { amount: 79, interval: 'month', currency: 'usd' },
  online_reviews: { amount: 49, interval: 'month', currency: 'usd' },
  vapi: { amount: 99, interval: 'month', currency: 'usd' },
  fleet_tracking: { amount: 79, interval: 'month', currency: 'usd' },
  seo_directory: { amount: 99, interval: 'month', currency: 'usd' },
  real_estate_data: { amount: 99, interval: 'month', currency: 'usd' },
  dealership_wizard: { amount: 129, interval: 'month', currency: 'usd' },
  wordpress_content: { amount: 79, interval: 'month', currency: 'usd' },
  materials_pricing: { amount: 59, interval: 'month', currency: 'usd' },
  event_ticketing: { amount: 99, interval: 'month', currency: 'usd' },
  credit_check: { amount: 79, interval: 'month', currency: 'usd' },
};

export function isPaidModule(feature: FeatureId): boolean {
  return Boolean(PAID_MODULE_PRICES[feature]) && !isPrivateFeature(feature);
}

export function modulePrice(feature: FeatureId): ModulePrice | null {
  return PAID_MODULE_PRICES[feature] ?? null;
}

export function formatModulePrice(price: ModulePrice): string {
  const dollars = Number.isInteger(price.amount) ? String(price.amount) : price.amount.toFixed(2);
  return `$${dollars}/${price.interval === 'month' ? 'mo' : price.interval}`;
}

export function moduleOfferCopy(feature: FeatureId): string {
  return FEATURE_BLURBS[feature] || FEATURE_LABELS[feature];
}

/** Official REΛVE / ops installs do not sell to themselves. */
export function moduleStorefrontEnabled(): boolean {
  return !isOpsInstall();
}
