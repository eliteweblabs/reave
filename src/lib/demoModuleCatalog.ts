/**
 * Numeric module IDs for demo suite URLs (?modules=[001,004,006,009]).
 * IDs are stable — used in sales links and seed filtering.
 */
import { FEATURE_IDS, FEATURE_LABELS, type FeatureId } from './featureCatalog';

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
  return [...DEMO_MODULE_CATALOG];
}

/** Markdown table of id → feature → label (for docs and agent knowledge). */
export function formatDemoModuleCatalogMarkdown(): string {
  const header = '| ID | Feature | Label |\n|----|---------|-------|';
  const rows = DEMO_MODULE_CATALOG.map(
    (e) => `| ${e.id} | \`${e.feature}\` | ${e.label.replace(/\|/g, '\\|')} |`,
  );
  return [header, ...rows].join('\n');
}
