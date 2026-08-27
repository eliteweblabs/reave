/**
 * Numeric module IDs for demo suite URLs (?modules=[010,110,410]).
 * Consecutive inside each band — Core 001…, Work 101…, and so on.
 * Railway FEATURES / config features[] stay feature slugs, not these numbers.
 */
import {
  CATALOG_BASELINE_FEATURES,
  catalogIdForFeature,
  migrateLegacyModuleId,
} from './moduleCatalog';
import {
  FEATURE_IDS,
  FEATURE_LABELS,
  expandFeatureRequirements,
  isPublicFeature,
  type FeatureId,
} from './featureCatalog';

export type DemoModuleCatalogEntry = {
  /** Zero-padded id, e.g. "010" */
  id: string;
  feature: FeatureId;
  label: string;
};

/** Canonical module catalog — ids from the Catalog bands. */
export const DEMO_MODULE_CATALOG: DemoModuleCatalogEntry[] = FEATURE_IDS.map((feature) => ({
  id: catalogIdForFeature(feature),
  feature,
  label: FEATURE_LABELS[feature],
}));

const BY_ID = new Map(DEMO_MODULE_CATALOG.map((e) => [e.id, e]));
const BY_FEATURE = new Map(DEMO_MODULE_CATALOG.map((e) => [e.feature, e]));

/** Tier-1 baseline — always enabled; hidden from the public demo loader picker. */
export const DEMO_BASELINE_MODULE_IDS = CATALOG_BASELINE_FEATURES.map((feature) =>
  catalogIdForFeature(feature),
) as readonly string[];

const BASELINE_MODULE_ID_SET = new Set<string>(DEMO_BASELINE_MODULE_IDS);

function padModuleId(id: string): string {
  const padded = id.trim().padStart(3, '0');
  if (BY_ID.has(padded)) return padded;
  return migrateLegacyModuleId(padded);
}

export function isDemoBaselineModuleId(id: string): boolean {
  return BASELINE_MODULE_ID_SET.has(padModuleId(id));
}

/** Baseline ids plus selected optional modules (sorted, deduped). */
export function mergeDemoModuleIds(selected: readonly string[]): string[] {
  const merged = new Set<string>([...DEMO_BASELINE_MODULE_IDS]);
  for (const id of selected) {
    const norm = padModuleId(id);
    if (norm) merged.add(norm);
  }
  for (const feature of resolveDemoModuleFeatures([...merged])) {
    const id = demoModuleIdForFeature(feature);
    if (id) merged.add(id);
  }
  return [...merged].sort();
}

export function demoModuleById(id: string): DemoModuleCatalogEntry | undefined {
  return BY_ID.get(padModuleId(id));
}

export function demoModuleIdForFeature(feature: FeatureId): string {
  return BY_FEATURE.get(feature)?.id ?? catalogIdForFeature(feature);
}

/** Parse modules=[010,110] or modules=010,110 from URL. Accepts legacy 001–N. */
export function parseDemoModuleIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(/[,|\s]+/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((s) => padModuleId(s));
}

export function resolveDemoModuleFeatures(ids: string[]): FeatureId[] {
  const out: FeatureId[] = [];
  for (const id of ids) {
    const entry = demoModuleById(id);
    if (entry && !out.includes(entry.feature)) out.push(entry.feature);
  }
  return expandFeatureRequirements(out);
}

export function catalogForChecklist(): DemoModuleCatalogEntry[] {
  return DEMO_MODULE_CATALOG.filter((e) => isPublicFeature(e.feature));
}

/** Markdown table of id → feature → label (for docs and agent knowledge). */
export function formatDemoModuleCatalogMarkdown(): string {
  const header = '| ID | Feature | Label |\n|----|---------|-------|';
  const rows = catalogForChecklist().map(
    (e) => `| ${e.id} | \`${e.feature}\` | ${e.label.replace(/\|/g, '\\|')} |`,
  );
  return [header, ...rows].join('\n');
}
