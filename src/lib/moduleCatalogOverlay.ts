/**
 * Apply the saved module catalog overlay onto public / admin catalogs.
 * Does not import demoLoaderCatalog — callers pass lists in to avoid cycles.
 */
import { CATALOG_GROUPS, CATALOG_GROUP_TITLES, type CatalogGroupId } from './moduleCatalog';
import { getModuleCatalogSync, peekCatalogRow } from './moduleCatalogStore';
import {
  FEATURE_ID_SET,
  FEATURE_LABELS,
  expandFeatureRequirements,
  featureRequirements,
  type FeatureId,
} from './featureCatalog';
import {
  formatModulePrice,
  isPaidModule,
  modulePrice,
  type ModulePrice,
} from './moduleStorefront';

export function catalogLabel(feature: string, fallback: string): string {
  return peekCatalogRow(feature)?.label || fallback;
}

export function catalogBlurb(feature: string, fallback: string): string {
  const row = peekCatalogRow(feature);
  return row ? row.blurb : fallback;
}

export function catalogSaleSheet(feature: string, fallback: boolean): boolean {
  const row = peekCatalogRow(feature);
  return row ? row.saleSheet : fallback;
}

export function catalogGroupFor(feature: string): CatalogGroupId | null {
  return peekCatalogRow(feature)?.group ?? null;
}

export function catalogRequires(feature: string): FeatureId[] {
  const row = peekCatalogRow(feature);
  const raw = row?.requires ?? featureRequirements(feature);
  return raw.filter((id): id is FeatureId => FEATURE_ID_SET.has(id) && id !== feature);
}

export function catalogRequiresLabels(feature: string): string[] {
  return catalogRequires(feature).map((id) => catalogLabel(id, FEATURE_LABELS[id] ?? id));
}

/** Selected modules plus catalog/code requirements, requirements first. */
export function expandCatalogRequirements(ids: Iterable<string>): FeatureId[] {
  const out: FeatureId[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (!FEATURE_ID_SET.has(id) || seen.has(id)) return;
    seen.add(id);
    for (const req of catalogRequires(id)) visit(req);
    out.push(id as FeatureId);
  };
  for (const id of ids) visit(id);
  return out.length ? out : expandFeatureRequirements(ids);
}

/** Modules that require `id` (catalog overlay). */
export function catalogDependents(id: string): FeatureId[] {
  return [
    ...new Set(
      getModuleCatalogSync()
        .filter((row) => row.requires.includes(id) && FEATURE_ID_SET.has(row.feature) && row.feature !== id)
        .map((row) => row.feature as FeatureId),
    ),
  ];
}

export function resolvedModulePrice(feature: FeatureId): ModulePrice | null {
  const row = peekCatalogRow(feature);
  if (!row) return modulePrice(feature);
  if (row.priceAmount == null || row.priceAmount <= 0) return null;
  return { amount: row.priceAmount, interval: 'once', currency: 'usd' };
}

export function resolvedIsPaidModule(feature: FeatureId): boolean {
  const row = peekCatalogRow(feature);
  if (!row) return isPaidModule(feature);
  if (row.kind === 'core' || row.visibility === 'private' || row.visibility === 'service') return false;
  return (row.priceAmount ?? 0) > 0;
}

export function overlayPricedModule<T extends { feature: FeatureId; label: string; blurb?: string; saleSheet?: boolean }>(
  item: T,
): T & { price: (ModulePrice & { label: string }) | null } {
  const price = resolvedModulePrice(item.feature);
  return {
    ...item,
    label: catalogLabel(item.feature, item.label),
    blurb: catalogBlurb(item.feature, item.blurb ?? ''),
    saleSheet: catalogSaleSheet(item.feature, item.saleSheet ?? false),
    price: price ? { ...price, label: formatModulePrice(price) } : null,
  };
}

export function overlayDemoModule<T extends { feature: string; label: string; blurb?: string; saleSheet?: boolean }>(
  item: T,
): T & { requires: FeatureId[]; requiresLabels: string[] } {
  return {
    ...item,
    label: catalogLabel(item.feature, item.label),
    blurb: catalogBlurb(item.feature, item.blurb ?? ''),
    saleSheet: catalogSaleSheet(item.feature, item.saleSheet ?? false),
    requires: catalogRequires(item.feature),
    requiresLabels: catalogRequiresLabels(item.feature),
  };
}

export function overlayIncludedCard<T extends { id: string; label: string; blurb?: string; saleSheet?: boolean }>(
  card: T,
): T {
  return {
    ...card,
    label: catalogLabel(card.id, card.label),
    blurb: catalogBlurb(card.id, card.blurb ?? ''),
    saleSheet: catalogSaleSheet(card.id, card.saleSheet ?? true),
  };
}

/** Rebuild public / add-on sections from the saved catalog group order. */
export function sectionsFromCatalog<T extends { feature: string }>(
  modules: readonly T[],
): Array<{ id: string; title: string; modules: T[] }> {
  const byFeature = new Map(modules.map((m) => [m.feature, m]));
  const claimed = new Set<string>();
  const rows = getModuleCatalogSync();
  const sections: Array<{ id: string; title: string; modules: T[] }> = [];

  for (const group of CATALOG_GROUPS) {
    if (group === 'core' || group === 'internal') continue;
    const sectionModules: T[] = [];
    for (const row of rows) {
      if (row.group !== group) continue;
      const mod = byFeature.get(row.feature);
      if (!mod || claimed.has(row.feature)) continue;
      claimed.add(row.feature);
      sectionModules.push(mod);
    }
    if (sectionModules.length) {
      sections.push({ id: group, title: CATALOG_GROUP_TITLES[group], modules: sectionModules });
    }
  }

  const leftover = modules.filter((m) => !claimed.has(m.feature));
  if (leftover.length) {
    sections.push({ id: 'optional', title: 'Other', modules: leftover });
  }
  return sections;
}
