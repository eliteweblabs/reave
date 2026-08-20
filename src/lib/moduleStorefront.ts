/**
 * Paid add-on catalog for in-app module purchase.
 *
 * Install config `features[]` is still what ships on deploy.
 * Clients request add-ons from account → Add-ons; owner enables after payment.
 * Deployment owners can runtime-toggle via feature overrides (Postgres).
 */
import type { FeatureId } from './featureCatalog.ts';
import { FEATURE_BLURBS, FEATURE_LABELS, isPrivateFeature } from './featureCatalog.ts';
import { isDemoBaselineModuleId, demoModuleIdForFeature } from './demoModuleCatalog.ts';
import { isOpsInstall } from './installConfig.ts';

export type ModulePrice = {
  amount: number;
  /** One-time add-on fee for now; recurring billing later. */
  interval: 'once' | 'month';
  currency: 'usd';
};

/** Suggested one-time add-on prices ($100–300). Baseline Core OS modules are not listed. */
export const PAID_MODULE_PRICES: Partial<Record<FeatureId, ModulePrice>> = {
  site_audits: { amount: 200, interval: 'once', currency: 'usd' },
  analytic_audit: { amount: 200, interval: 'once', currency: 'usd' },
  site_monitoring: { amount: 175, interval: 'once', currency: 'usd' },
  uptime_monitoring: { amount: 175, interval: 'once', currency: 'usd' },
  documents: { amount: 175, interval: 'once', currency: 'usd' },
  voice: { amount: 250, interval: 'once', currency: 'usd' },
  vapi: { amount: 250, interval: 'once', currency: 'usd' },
  carddav: { amount: 150, interval: 'once', currency: 'usd' },
  scheduling: { amount: 175, interval: 'once', currency: 'usd' },
  email_marketing: { amount: 200, interval: 'once', currency: 'usd' },
  fleet_tracking: { amount: 275, interval: 'once', currency: 'usd' },
  dealership_wizard: { amount: 300, interval: 'once', currency: 'usd' },
  namecom_dns: { amount: 150, interval: 'once', currency: 'usd' },
  time_tracking: { amount: 150, interval: 'once', currency: 'usd' },
  real_estate_data: { amount: 275, interval: 'once', currency: 'usd' },
  inventory_sync: { amount: 275, interval: 'once', currency: 'usd' },
  online_reviews: { amount: 175, interval: 'once', currency: 'usd' },
  wayback_machine: { amount: 100, interval: 'once', currency: 'usd' },
  content_management: { amount: 250, interval: 'once', currency: 'usd' },
  stock_photos: { amount: 100, interval: 'once', currency: 'usd' },
  wordpress_content: { amount: 200, interval: 'once', currency: 'usd' },
  seo_directory: { amount: 250, interval: 'once', currency: 'usd' },
  event_ticketing: { amount: 250, interval: 'once', currency: 'usd' },
  cookie_notice: { amount: 100, interval: 'once', currency: 'usd' },
  website: { amount: 200, interval: 'once', currency: 'usd' },
  credit_check: { amount: 300, interval: 'once', currency: 'usd' },
  materials_pricing: { amount: 200, interval: 'once', currency: 'usd' },
  social_inbox: { amount: 200, interval: 'once', currency: 'usd' },
  // Internal — listed for owner testing on ops installs; not sold to clients.
  dev_infra: { amount: 0, interval: 'once', currency: 'usd' },
  code_dev: { amount: 0, interval: 'once', currency: 'usd' },
  demo: { amount: 0, interval: 'once', currency: 'usd' },
  deploy_wizard: { amount: 0, interval: 'once', currency: 'usd' },
};

export function isPaidModule(feature: FeatureId): boolean {
  const price = PAID_MODULE_PRICES[feature];
  if (!price || price.amount <= 0) return false;
  if (isPrivateFeature(feature)) return false;
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
