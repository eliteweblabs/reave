/**
 * Numeric module IDs for demo suite URLs (?modules=[001,004,006,009]).
 * IDs are stable — used in sales links and seed filtering.
 */
import { FEATURE_IDS, FEATURE_LABELS, isPublicFeature, type FeatureId } from './featureCatalog';

export type DemoModuleCatalogEntry = {
  /** Zero-padded id, e.g. "001" */
  id: string;
  feature: FeatureId;
  label: string;
};

/** Canonical module catalog — order matches FEATURE_IDS. */
export const DEMO_MODULE_CATALOG: DemoModuleCatalogEntry[] = FEATURE_IDS.map((feature, i) => ({
  id: String(i + 1).padStart(3, '0'),
  feature,
  label: FEATURE_LABELS[feature],
}));

const BY_ID = new Map(DEMO_MODULE_CATALOG.map((e) => [e.id, e]));
const BY_FEATURE = new Map(DEMO_MODULE_CATALOG.map((e) => [e.feature, e]));

/**
 * Tier-1 baseline — always enabled; hidden from the public demo loader picker.
 * 001–004 are the original client pack; 036 is email_signature (appended so
 * earlier sales IDs stay stable — 035 is materials_pricing on main).
 */
export const DEMO_BASELINE_MODULE_IDS = ['001', '002', '003', '004', '036'] as const;

const BASELINE_MODULE_ID_SET = new Set<string>(DEMO_BASELINE_MODULE_IDS);

export function isDemoBaselineModuleId(id: string): boolean {
  return BASELINE_MODULE_ID_SET.has(id.trim().padStart(3, '0'));
}

/** Baseline ids plus selected optional modules (sorted, deduped). */
export function mergeDemoModuleIds(selected: readonly string[]): string[] {
  const merged = new Set<string>([...DEMO_BASELINE_MODULE_IDS]);
  for (const id of selected) {
    const norm = id.trim().padStart(3, '0');
    if (norm) merged.add(norm);
  }
  return [...merged].sort();
}

export function demoModuleById(id: string): DemoModuleCatalogEntry | undefined {
  const norm = id.trim().padStart(3, '0');
  return BY_ID.get(norm);
}

export function demoModuleIdForFeature(feature: FeatureId): string {
  return BY_FEATURE.get(feature)?.id ?? '';
}

/** Parse modules=[001,004] or modules=001,004 from URL. */
export function parseDemoModuleIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(/[,|\s]+/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((s) => s.padStart(3, '0'));
}

export function resolveDemoModuleFeatures(ids: string[]): FeatureId[] {
  const out: FeatureId[] = [];
  for (const id of ids) {
    const entry = demoModuleById(id);
    if (entry && !out.includes(entry.feature)) out.push(entry.feature);
  }
  return out;
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
