/**
 * Per-industry deploy recipe — modules, extras, sample data, and operator notes.
 * Stored on the industries catalog and applied by the deploy wizard.
 */
import {
  catalogForChecklist,
  isDemoBaselineModuleId,
} from './demoModuleCatalog';

export const INDUSTRY_PLAYBOOK_EXTRAS = [
  'materials',
  'changedetection_railway',
  'plausible_railway',
] as const;

export type IndustryPlaybookExtraId = (typeof INDUSTRY_PLAYBOOK_EXTRAS)[number];

const EXTRA_SET = new Set<string>(INDUSTRY_PLAYBOOK_EXTRAS);

export type DeckIndustryPlaybook = {
  /** Optional modules (tier-1 baseline always included on apply). */
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
    const id = item.trim().padStart(3, '0');
    if (!/^\d{3}$/.test(id) || seen.has(id) || isDemoBaselineModuleId(id)) continue;
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
  return {
    moduleIds: normalizePlaybookModuleIds(o.moduleIds),
    extras: normalizePlaybookExtras(o.extras),
    seedInbox: o.seedInbox !== false,
    seedTodos: o.seedTodos !== false,
    seedSchedule: o.seedSchedule !== false,
    postAlias: normalizePlaybookPostAlias(o.postAlias),
    notes: normalizePlaybookNotes(o.notes),
  };
}

/** Fallback recipe when a seed fixture is not in the industries catalog yet. */
export function defaultFixturePlaybook(id: string): DeckIndustryPlaybook {
  if (id === 'law') {
    return {
      ...EMPTY_INDUSTRY_PLAYBOOK,
      postAlias: 'matter',
      notes:
        'Law installs use “matter” as the work name. Court knowledge can be gated from the office pin after you pick an address in the wizard.',
    };
  }
  return { ...EMPTY_INDUSTRY_PLAYBOOK };
}

export function listIndustryPlaybookModules(): Array<{ id: string; label: string }> {
  return catalogForChecklist()
    .filter((e) => !isDemoBaselineModuleId(e.id))
    .map((e) => ({ id: e.id, label: e.label }))
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
  const moduleIds = [
    ...new Set([
      ...input.baselineModuleIds,
      ...playbook.moduleIds.filter((id) => input.allowedModuleIds.has(id)),
    ]),
  ].sort();
  const postAlias =
    playbook.postAlias ||
    (input.industryId === 'law' ? 'matter' : input.currentPostAlias || 'project');
  return {
    moduleIds,
    extras: playbook.extras.filter((id) => EXTRA_SET.has(id)),
    seed: {
      inbox: playbook.seedInbox,
      todos: playbook.seedTodos,
      schedule: playbook.seedSchedule,
    },
    postAlias,
  };
}
