/**
 * One-time add-on list prices. Kept off moduleStorefront so catalog IDs
 * can import prices without a demoModuleCatalog cycle.
 */
import type { FeatureId } from './featureCatalog.ts';

export type ModulePrice = {
  amount: number;
  interval: 'once' | 'month' | 'year';
  currency: 'usd';
};

/** Suggested one-time add-on prices ($100–300). Baseline Core OS modules are not listed. */
export const PAID_MODULE_PRICES: Partial<Record<FeatureId, ModulePrice>> = {
  billing: { amount: 200, interval: 'once', currency: 'usd' },
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
  google_workspace: { amount: 200, interval: 'once', currency: 'usd' },
  hosting_core_os: { amount: 600, interval: 'year', currency: 'usd' },
  hosting_growth: { amount: 900, interval: 'year', currency: 'usd' },
  dev_infra: { amount: 0, interval: 'once', currency: 'usd' },
  code_dev: { amount: 0, interval: 'once', currency: 'usd' },
  demo: { amount: 0, interval: 'once', currency: 'usd' },
  deploy_wizard: { amount: 0, interval: 'once', currency: 'usd' },
};
