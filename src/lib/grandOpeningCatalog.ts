/**
 * Curated module list for the /grand-opening add-on picker.
 */
import {
  FEATURE_BLURBS,
  FEATURE_GRAND_OPENING,
  FEATURE_LABELS,
  isGrandOpeningCatalogFeature,
  type FeatureId,
} from './featureCatalog';
import { catalogBlurb, catalogGrandOpening, catalogLabel } from './moduleCatalogOverlay';
import { ensureModuleCatalogLoaded, getModuleCatalogSync } from './moduleCatalogStore';
import { formatModulePrice, modulePrice } from './moduleStorefront';

/** Preferred display order — CMS and login first among add-ons. */
const DISPLAY_ORDER: FeatureId[] = [
  'website',
  'client_portal',
  'portal_assistant',
  'hosting_growth',
  'scheduling',
  'online_reviews',
  'billing',
  'email_marketing',
  'documents',
  'digital_signature',
  'site_audits',
  'social_inbox',
  'video_meet',
];

export type GrandOpeningModule = {
  feature: string;
  label: string;
  blurb: string;
  priceLabel: string;
};

export async function loadGrandOpeningModules(): Promise<GrandOpeningModule[]> {
  await ensureModuleCatalogLoaded();
  return listGrandOpeningModules();
}

export function listGrandOpeningModules(): GrandOpeningModule[] {
  const catalog = getModuleCatalogSync();
  const mods: GrandOpeningModule[] = [];
  const seen = new Set<string>();

  for (const row of catalog) {
    if (row.feature === 'hosting_core_os') continue;
    const fallback = isGrandOpeningCatalogFeature(row.feature, row.kind);
    if (!catalogGrandOpening(row.feature, fallback)) continue;
    seen.add(row.feature);
    mods.push({
      feature: row.feature,
      label: catalogLabel(row.feature, row.label),
      blurb: catalogBlurb(row.feature, row.blurb),
      priceLabel: row.priceLabel || 'Quote',
    });
  }

  for (const feature of FEATURE_GRAND_OPENING) {
    if (seen.has(feature)) continue;
    const price = modulePrice(feature);
    mods.push({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      blurb: FEATURE_BLURBS[feature] ?? '',
      priceLabel: price ? formatModulePrice(price) : 'Quote',
    });
  }

  const order = new Map(DISPLAY_ORDER.map((f, i) => [f, i]));
  mods.sort((a, b) => {
    const ao = order.get(a.feature as FeatureId) ?? 999;
    const bo = order.get(b.feature as FeatureId) ?? 999;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return mods;
}
