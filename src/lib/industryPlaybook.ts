/**
 * Per-industry deploy recipe — modules, extras, sample data, and operator notes.
 * Stored on the industries catalog and applied by the deploy wizard.
 */
import {
  catalogForChecklist,
  demoModuleById,
  demoModuleIdForFeature,
  isDemoBaselineModuleId,
} from './demoModuleCatalog';
import { expandFeatureRequirements } from './featureCatalog';
import { migrateLegacyModuleId } from './moduleCatalog';
import { catalogRequires } from './moduleCatalogOverlay';

export const INDUSTRY_PLAYBOOK_EXTRAS = [
  'changedetection_railway',
  'plausible_railway',
] as const;

export type IndustryPlaybookExtraId = (typeof INDUSTRY_PLAYBOOK_EXTRAS)[number];

const EXTRA_SET = new Set<string>(INDUSTRY_PLAYBOOK_EXTRAS);

export type DeckIndustryPlaybook = {
  /** Optional modules (Core OS baseline FeatureIds always included on apply). */
  moduleIds: string[];
  extras: IndustryPlaybookExtraId[];
  seedInbox: boolean;
  seedTodos: boolean;
  seedSchedule: boolean;
  /** Work record name (`POST_ALIAS`). Empty = wizard default / law→matter. */
  postAlias: string;
  /** Operator notes shown in the deploy wizard. */
  notes: string;
};

export const EMPTY_INDUSTRY_PLAYBOOK: DeckIndustryPlaybook = {
  moduleIds: [],
  extras: [],
  seedInbox: true,
  seedTodos: true,
  seedSchedule: true,
  postAlias: '',
  notes: '',
};

/** Seed industries the deploy wizard already shipped before the catalog existed. */
export const CANONICAL_DEPLOY_INDUSTRIES = [
  { slug: 'general', label: 'General contractor' },
  { slug: 'field-service', label: 'Mobile field service' },
  { slug: 'law', label: 'Law firm' },
  { slug: 'plumbing', label: 'Plumbing' },
] as const;

const DEPLOY_INDUSTRY_ALIASES: Record<string, string> = {
  plumber: 'plumbing',
  plumbers: 'plumbing',
  'law-firm': 'law',
  legal: 'law',
  lawyer: 'law',
  bankruptcy: 'law',
  'general-contractor': 'general',
  contractor: 'general',
  'mobile-vet': 'field-service',
  veterinary: 'field-service',
  veterinarian: 'field-service',
  vet: 'field-service',
  'mobile-service': 'field-service',
  'house-call': 'field-service',
  'house-calls': 'field-service',
  'field-services': 'field-service',
};

export function canonicalDeployIndustrySlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  if (CANONICAL_DEPLOY_INDUSTRIES.some((row) => row.slug === slug)) return slug;
  return DEPLOY_INDUSTRY_ALIASES[slug] ?? null;
}

export function isLawIndustrySlug(raw: string): boolean {
  return canonicalDeployIndustrySlug(raw) === 'law';
}

export function isBlankIndustryPlaybook(raw: unknown): boolean {
  const playbook = normalizeIndustryPlaybook(raw);
  return (
    playbook.moduleIds.length === 0 &&
    playbook.extras.length === 0 &&
    !playbook.postAlias &&
    !playbook.notes &&
    playbook.seedInbox &&
    playbook.seedTodos &&
    playbook.seedSchedule
  );
}

export function normalizePlaybookPostAlias(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim().toLowerCase();
  if (!t || !/^[a-z][a-z0-9-]*$/.test(t)) return '';
  return t.slice(0, 32);
}

export function normalizePlaybookNotes(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n/g, '\n').trim().slice(0, 2000);
}

export function normalizePlaybookModuleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const padded = item.trim().padStart(3, '0');
    const id = /^\d{3}$/.test(padded) ? migrateLegacyModuleId(padded) : '';
    if (!/^\d{3}$/.test(id) || seen.has(id) || isDemoBaselineModuleId(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const features = out
    .map((id) => demoModuleById(id)?.feature)
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));
  for (const feature of expandFeatureRequirements(features)) {
    const id = demoModuleIdForFeature(feature);
    if (!id || seen.has(id) || isDemoBaselineModuleId(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort();
}

export function normalizePlaybookExtras(raw: unknown): IndustryPlaybookExtraId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: IndustryPlaybookExtraId[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !EXTRA_SET.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as IndustryPlaybookExtraId);
  }
  return out;
}

export function normalizeIndustryPlaybook(raw: unknown): DeckIndustryPlaybook {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const moduleIds = normalizePlaybookModuleIds(o.moduleIds);
  const extras = normalizePlaybookExtras(o.extras);

  // Legacy playbooks stored materials as an extra — promote to the materials_pricing module.
  const legacyMaterials = Array.isArray(o.extras) && o.extras.includes('materials');
  if (legacyMaterials) {
    const materialsId = demoModuleIdForFeature('materials_pricing');
    if (materialsId && !moduleIds.includes(materialsId)) moduleIds.push(materialsId);
    moduleIds.sort();
  }

  return {
    moduleIds,
    extras,
    seedInbox: o.seedInbox !== false,
    seedTodos: o.seedTodos !== false,
    seedSchedule: o.seedSchedule !== false,
    postAlias: normalizePlaybookPostAlias(o.postAlias),
    notes: normalizePlaybookNotes(o.notes),
  };
}

/** Recipe the deploy wizard already used for each seed industry. */
export function defaultFixturePlaybook(id: string): DeckIndustryPlaybook {
  const canonical = canonicalDeployIndustrySlug(id) ?? id.trim().toLowerCase();
  if (canonical === 'law') {
    return {
      ...EMPTY_INDUSTRY_PLAYBOOK,
      postAlias: 'matter',
      notes:
        'Law installs use “matter” as the work name. Court knowledge can be gated from the office pin after you pick an address in the wizard.',
    };
  }
  if (canonical === 'plumbing') {
    return {
      ...EMPTY_INDUSTRY_PLAYBOOK,
      notes:
        'Plumbing installs seed a sample inbox, jobs, and schedule for a trade shop. Live email can replace this after apply.',
    };
  }
  if (canonical === 'field-service') {
    const moduleIds = [
      demoModuleIdForFeature('fleet_tracking'),
      demoModuleIdForFeature('scheduling'),
      demoModuleIdForFeature('time_tracking'),
    ].filter(Boolean);
    return {
      ...EMPTY_INDUSTRY_PLAYBOOK,
      moduleIds,
      notes:
        'Mobile field service — house calls, mobile vets, on-site care. Fleet GPS tracks vans in real time. Cal.com handles client booking. Work → visit planner (/admin/visit-plan) clusters stops by geography and estimates drive time; set visit duration per stop (e.g. 45–60m for clinical visits). Assign drivers in Fleet so their signed-in session reports GPS.',
    };
  }
  if (canonical === 'general') {
    return {
      ...EMPTY_INDUSTRY_PLAYBOOK,
      notes:
        'General contractor installs seed inbox, todos, and schedule so the dashboard is not empty before live email is connected.',
    };
  }
  return { ...EMPTY_INDUSTRY_PLAYBOOK };
}

export type CanonicalIndustryRow = {
  id: number;
  slug: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  playbook: DeckIndustryPlaybook;
  updatedAt: string | null;
};

/**
 * Ensure Law firm, Plumbing, and General contractor exist with the recipes
 * the deploy wizard already used. Alias rows like “Plumbers” become Plumbing
 * when that official slug is free. Blank playbooks on those slugs are filled.
 */
export function backfillCanonicalDeployIndustries(
  list: CanonicalIndustryRow[],
): { list: CanonicalIndustryRow[]; changed: boolean } {
  const now = new Date().toISOString();
  const next = list.map((item) => ({
    ...item,
    playbook: normalizeIndustryPlaybook(item.playbook),
  }));
  let changed = false;
  const bySlug = new Map(next.map((item) => [item.slug, item]));

  for (const item of next) {
    const canonical = canonicalDeployIndustrySlug(item.slug);
    if (!canonical) continue;
    const official = CANONICAL_DEPLOY_INDUSTRIES.find((row) => row.slug === canonical);
    if (!official) continue;

    if (item.slug !== canonical && !bySlug.has(canonical)) {
      bySlug.delete(item.slug);
      item.slug = official.slug;
      item.label = official.label;
      bySlug.set(canonical, item);
      changed = true;
    }

    if (isBlankIndustryPlaybook(item.playbook)) {
      item.playbook = defaultFixturePlaybook(canonical);
      changed = true;
    }
  }

  let maxId = next.reduce((max, item) => Math.max(max, item.id || 0), 0);
  for (const official of CANONICAL_DEPLOY_INDUSTRIES) {
    if (bySlug.has(official.slug)) continue;
    maxId += 1;
    const row: CanonicalIndustryRow = {
      id: maxId,
      slug: official.slug,
      label: official.label,
      sortOrder: next.length,
      enabled: true,
      playbook: defaultFixturePlaybook(official.slug),
      updatedAt: now,
    };
    next.push(row);
    bySlug.set(official.slug, row);
    changed = true;
  }

  if (!changed) return { list: next, changed: false };
  next.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  next.forEach((item, i) => {
    item.sortOrder = i;
  });
  return { list: next, changed: true };
}

export function listIndustryPlaybookModules(): Array<{
  id: string;
  label: string;
  feature: string;
  requires: string[];
}> {
  return catalogForChecklist()
    .filter((e) => !isDemoBaselineModuleId(e.id))
    .map((e) => ({
      id: e.id,
      label: e.label,
      feature: e.feature,
      requires: catalogRequires(e.feature),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function applyIndustryPlaybookToWizard(input: {
  industryId: string;
  playbook?: DeckIndustryPlaybook | null;
  allowedModuleIds: ReadonlySet<string>;
  baselineModuleIds: readonly string[];
  currentModuleIds: readonly string[];
  currentExtras: readonly string[];
  currentPostAlias: string;
}): {
  moduleIds: string[];
  extras: string[];
  seed: { inbox: boolean; todos: boolean; schedule: boolean };
  postAlias: string;
} {
  if (!input.industryId || input.industryId === 'none') {
    return {
      moduleIds: [...input.currentModuleIds],
      extras: [...input.currentExtras],
      seed: { inbox: true, todos: true, schedule: true },
      postAlias: input.currentPostAlias,
    };
  }
  const playbook = normalizeIndustryPlaybook(input.playbook);
  // Keep modules the operator already toggled — a blank Law playbook must
  // not wipe Cal.com / Vapi / Pexels / etc. down to Core OS baseline.
  const moduleIds = [
    ...new Set([
      ...input.currentModuleIds.filter((id) => input.allowedModuleIds.has(id)),
      ...input.baselineModuleIds,
      ...playbook.moduleIds.filter((id) => input.allowedModuleIds.has(id)),
    ]),
  ].sort();
  const postAlias =
    playbook.postAlias ||
    (isLawIndustrySlug(input.industryId) ? 'matter' : input.currentPostAlias || 'project');
  return {
    moduleIds,
    extras: [...new Set([...input.currentExtras, ...playbook.extras])].filter((id) => EXTRA_SET.has(id)),
    seed: {
      inbox: playbook.seedInbox,
      todos: playbook.seedTodos,
      schedule: playbook.seedSchedule,
    },
    postAlias,
  };
}
