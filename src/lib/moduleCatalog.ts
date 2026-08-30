/**
 * Default module catalog for the super-admin Catalog page.
 * Runtime edits live in moduleCatalogStore (Postgres / JSON overlay).
 *
 * Numeric ids are consecutive inside each band (no gaps):
 * Core 001–100, Work 101–200, Social 201–300, E-commerce 301–400,
 * Web Development 401–500, Other 501–600, Internal 601–700,
 * Google™ Workspace 701–800 (client mail/DNS — not a reΛVe.app feature),
 * Hosting 801–900 (managed care plans from /hosting — not a reΛVe.app feature),
 * Real Estate 901–999 (DSCR and the rest of the investor calculator suite).
 * Assignment order is a stable shuffle — ids are not A–Z rank.
 */
import {
  aggregatedGoogleWorkspaceBlurb,
  FEATURE_BLURBS,
  FEATURE_IDS,
  FEATURE_LABELS,
  FEATURE_SALE_SHEET,
  featureRequirements,
  featureVisibility,
  isHostingFeature,
  isPrivateFeature,
  type FeatureId,
} from './featureCatalog';
import { MODULE_DISPLAY_GROUPS } from './moduleDisplayGroups';
import { PAID_MODULE_PRICES } from './paidModulePrices';

/** Core OS cards that are also FeatureIds (demo suite / playbook baseline). */
export const CORE_CARD_FEATURES: Readonly<Record<string, FeatureId>> = {
  client_portal: 'client_portal',
  handoff_vault: 'web_handoff',
  portal_assistant: 'portal_assistant',
};

export const CATALOG_BASELINE_FEATURES: readonly FeatureId[] = [
  'client_portal',
  'web_handoff',
  'portal_assistant',
];

const BASELINE_FEATURE_SET = new Set<string>(CATALOG_BASELINE_FEATURES);

export const CATALOG_GROUPS = [
  'core',
  'work',
  'google_workspace',
  'hosting',
  'social',
  'e_commerce',
  'web_development',
  'real_estate',
  'other',
  'internal',
] as const;

export type CatalogGroupId = (typeof CATALOG_GROUPS)[number];

export const CATALOG_ID_BANDS: Record<CatalogGroupId, { start: number; end: number }> = {
  core: { start: 1, end: 100 },
  work: { start: 101, end: 200 },
  google_workspace: { start: 701, end: 800 },
  hosting: { start: 801, end: 900 },
  social: { start: 201, end: 300 },
  e_commerce: { start: 301, end: 400 },
  web_development: { start: 401, end: 500 },
  real_estate: { start: 901, end: 999 },
  other: { start: 501, end: 600 },
  internal: { start: 601, end: 700 },
};

export function formatCatalogId(n: number): string {
  return String(n).padStart(3, '0');
}

export function parseCatalogId(raw: string): number | null {
  const n = Number(String(raw).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Stable shuffle so ids are not alphabetical rank. */
function shuffleStable<T>(items: readonly T[], seedKey: string): T[] {
  const out = [...items];
  let seed = hashSeed(seedKey);
  for (let i = out.length - 1; i > 0; i--) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Consecutive ids from the group band start — 001, 002… / 101, 102… */
export function sequentialCatalogIds(count: number, group: CatalogGroupId): string[] {
  const band = CATALOG_ID_BANDS[group];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = band.start + i;
    if (n > band.end) {
      throw new Error(`Catalog id overflow in ${group} (${n} > ${band.end})`);
    }
    ids.push(formatCatalogId(n));
  }
  return ids;
}

export const CATALOG_GROUP_TITLES: Record<CatalogGroupId, string> = {
  core: 'Core OS',
  work: 'Work',
  google_workspace: 'Google™ Workspace',
  hosting: 'Hosting',
  social: 'Social',
  e_commerce: 'E-commerce',
  web_development: 'Web Development',
  real_estate: 'Real Estate',
  other: 'Other',
  internal: 'Internal',
};

export type CatalogRowKind = 'core' | 'module' | 'custom';

/** Core OS marketing cards — also re-exported as DEMO_LOADER_INCLUDED_CARDS. */
export const CORE_OS_CARDS: readonly { id: string; label: string; blurb: string }[] = [
  {
    id: 'web_search',
    label: 'Agentic Web Search',
    blurb: 'Live public lookup when knowledge isn’t enough — businesses, people, & sites.',
  },
  {
    id: 'agent_chat',
    label: 'Agentic Chat',
    blurb: 'Your always-on operations assistant — runs tools, files work, & follows playbooks.',
  },
  {
    id: 'chat_commands',
    label: 'Chat / Commands',
    blurb: 'Type / in agent chat for slash commands — knowledge, jobs, billing, & the rest of the OS.',
  },
  {
    id: 'business_audit',
    label: 'Business Audit',
    blurb: 'Automated presence & reputation review — GBP, reviews, NAP, & content.',
  },
  {
    id: 'client_portal',
    label: 'Client Portal',
    blurb: 'A branded portal for every client — projects, files, & status in one place.',
  },
  {
    id: 'crm',
    label: 'CRM',
    blurb: 'Contacts, companies, & client profiles — searchable by name, phone, or domain.',
  },
  {
    id: 'dynamic_todos',
    label: 'Dynamic To-Dos',
    blurb: 'Dynamic alerts for personal or work — create, update, & clear with the agent or Siri.',
  },
  {
    id: 'email_inbox',
    label: 'Inbox Triage',
    blurb: 'Triage client mail, draft replies, & file threads onto the right project.',
  },
  {
    id: 'handoff_vault',
    label: 'Handoff Vault',
    blurb: 'Bidirectionally share secure credentials & other data in the portal Data tab.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Base',
    blurb: 'Playbooks the agent actually follows — SOPs, install notes, & how-tos on demand.',
  },
  {
    id: 'media_library',
    label: 'Media Library',
    blurb: 'Upload & reuse logos, photos, & PDFs for branding & content — pick once, use everywhere.',
  },
  {
    id: 'passkeys',
    label: 'Passkeys & Face ID',
    blurb: 'Sign in with Face ID, Touch ID, or a device passkey after the first visit — no password on return.',
  },
  {
    id: 'phone_sign_in',
    label: 'Phone Sign-In',
    blurb: 'Sign in with a one-time code texted to your phone — separate from two-way business SMS.',
  },
  {
    id: 'portal_assistant',
    label: 'Portal Assistant',
    blurb: 'Speed-dial help chat so clients get answers without ringing your phone.',
  },
  {
    id: 'projects',
    label: 'Projects & Work',
    blurb: 'Jobs, inquiry notes, & delivery tracking with full agent read/write.',
  },
];

export type CatalogRow = {
  key: string;
  kind: CatalogRowKind;
  group: CatalogGroupId;
  id: string;
  feature: string;
  label: string;
  blurb: string;
  priceAmount: number | null;
  priceLabel: string;
  saleSheet: boolean;
  visibility: 'public' | 'private' | 'service';
  /** Feature slugs that turn on automatically with this module. */
  requires: string[];
  /** Industry slugs that include this module in a suggested demo / deploy stack. */
  industries: string[];
};

export function catalogGroupForFeature(feature: FeatureId): CatalogGroupId {
  if (feature === 'google_workspace') return 'google_workspace';
  if (isHostingFeature(feature)) return 'hosting';
  if (isPrivateFeature(feature) || feature === 'demo') return 'internal';
  const grouped = MODULE_DISPLAY_GROUPS.find((g) => g.features.includes(feature));
  if (grouped?.id === 'work') return 'work';
  if (grouped?.id === 'social') return 'social';
  if (grouped?.id === 'e_commerce') return 'e_commerce';
  if (grouped?.id === 'web_development') return 'web_development';
  if (grouped?.id === 'real_estate') return 'real_estate';
  return 'other';
}

type IdTables = {
  byFeature: Map<FeatureId, string>;
  byCard: Map<string, string>;
  all: Set<string>;
};

let _ids: IdTables | null = null;

function buildIdTables(): IdTables {
  const byFeature = new Map<FeatureId, string>();
  const byCard = new Map<string, string>();
  const all = new Set<string>();

  const coreCards = shuffleStable(CORE_OS_CARDS, 'catalog-ids:core');
  const coreIds = sequentialCatalogIds(coreCards.length, 'core');
  coreCards.forEach((card, i) => {
    const id = coreIds[i]!;
    byCard.set(card.id, id);
    all.add(id);
    const feature = CORE_CARD_FEATURES[card.id];
    if (feature) byFeature.set(feature, id);
  });

  const grouped = new Map<CatalogGroupId, FeatureId[]>();
  for (const group of CATALOG_GROUPS) {
    if (group === 'core') continue;
    grouped.set(group, []);
  }
  for (const feature of FEATURE_IDS) {
    if (feature === 'content_management') continue;
    if (byFeature.has(feature)) continue;
    const group = catalogGroupForFeature(feature);
    if (group === 'core') continue;
    grouped.get(group)!.push(feature);
  }

  for (const [group, features] of grouped) {
    const shuffled = shuffleStable(features, `catalog-ids:${group}`);
    const ids = sequentialCatalogIds(shuffled.length, group);
    shuffled.forEach((feature, i) => {
      const id = ids[i]!;
      byFeature.set(feature, id);
      all.add(id);
    });
  }

  return { byFeature, byCard, all };
}

function idTables(): IdTables {
  if (!_ids) _ids = buildIdTables();
  return _ids;
}

export function catalogIdForFeature(feature: FeatureId): string {
  return idTables().byFeature.get(feature) ?? '';
}

export function catalogIdForCard(cardId: string): string {
  return idTables().byCard.get(cardId) ?? '';
}

export function isAssignedCatalogId(id: string): boolean {
  const padded = id.trim().padStart(3, '0');
  return idTables().all.has(padded);
}

/** Old sequential 001–N (FEATURE_IDS order) → current banded id. */
export function migrateLegacyModuleId(raw: string): string {
  const padded = raw.trim().padStart(3, '0');
  if (!/^\d{3}$/.test(padded)) return padded;
  const index = Number(padded) - 1;
  if (index < 0 || index >= FEATURE_IDS.length) return padded;
  const feature = FEATURE_IDS[index]!;
  return catalogIdForFeature(feature) || padded;
}

export function canonicalRowId(row: Pick<CatalogRow, 'kind' | 'group' | 'feature' | 'id'>, taken: Iterable<string>): string {
  if (row.kind === 'core') return catalogIdForCard(row.feature) || nextCatalogId(row.group, taken);
  if (row.kind === 'module' && FEATURE_ID_SET_LOCAL.has(row.feature)) {
    return catalogIdForFeature(row.feature as FeatureId) || nextCatalogId(row.group, taken);
  }
  const existing = parseCatalogId(row.id || '');
  const band = CATALOG_ID_BANDS[row.group];
  if (existing != null && existing >= band.start && existing <= band.end) {
    return formatCatalogId(existing);
  }
  return nextCatalogId(row.group, taken);
}

const FEATURE_ID_SET_LOCAL = new Set<string>(FEATURE_IDS);

export function nextCatalogId(group: CatalogGroupId, taken: Iterable<string>): string {
  const band = CATALOG_ID_BANDS[group];
  const used = new Set(
    [...taken].map((id) => id.trim().padStart(3, '0')).filter((id) => /^\d{3}$/.test(id)),
  );
  for (let n = band.start; n <= band.end; n++) {
    const id = formatCatalogId(n);
    if (!used.has(id)) return id;
  }
  return formatCatalogId(band.end);
}

/**
 * Legacy catalog slugs → current Industries API slugs.
 * Stored rows may use either; demo loader packages resolve both.
 */
export const INDUSTRY_SLUG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  salon: ['hair-stylists'],
  marketing: ['marketers'],
  'real-estate': ['real-estate-agents'],
  engineer: ['engineers'],
  law: ['lawyers'],
  content: ['artists', 'creators', 'designers'],
  principal: ['entrepreneurs'],
  plumbing: ['electricians'],
};

export function expandIndustrySlugs(slugs: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    const key = String(slug || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    for (const alias of INDUSTRY_SLUG_ALIASES[key] || []) {
      if (seen.has(alias)) continue;
      seen.add(alias);
      out.push(alias);
    }
  }
  return out;
}

const ALL_INDUSTRIES = [
  'artists',
  'creators',
  'designers',
  'electricians',
  'engineers',
  'entrepreneurs',
  'general',
  'hair-stylists',
  'law',
  'lawyers',
  'marketers',
  'plumbing',
  'real-estate-agents',
] as const;

const TRADE_INDUSTRIES = ['general', 'plumbing', 'electricians'] as const;
const CREATIVE_INDUSTRIES = ['artists', 'creators', 'designers', 'marketers'] as const;
const WEB_INDUSTRIES = [
  'artists',
  'creators',
  'designers',
  'entrepreneurs',
  'general',
  'hair-stylists',
  'law',
  'lawyers',
  'marketers',
  'plumbing',
  'electricians',
  'real-estate-agents',
] as const;

/**
 * Best-guess industry defaults for optional modules.
 * Core OS is always on and is not listed here.
 */
export const DEFAULT_MODULE_INDUSTRIES: Readonly<Record<string, readonly string[]>> = {
  billing: ALL_INDUSTRIES,
  google_workspace: ALL_INDUSTRIES,
  website: ALL_INDUSTRIES,
  cookie_notice: ALL_INDUSTRIES,
  hosting_core_os: ALL_INDUSTRIES,
  hosting_growth: ['artists', 'creators', 'designers', 'marketers', 'entrepreneurs', 'engineers'],
  scheduling: ['hair-stylists', 'general', 'plumbing', 'electricians', 'marketers', 'law', 'lawyers', 'real-estate-agents'],
  documents: ['law', 'lawyers', 'general', 'plumbing', 'electricians', 'real-estate-agents', 'entrepreneurs', 'engineers'],
  digital_signature: ['law', 'lawyers', 'real-estate-agents', 'general', 'plumbing', 'electricians'],
  voice: ['hair-stylists', 'general', 'plumbing', 'electricians', 'law', 'lawyers', 'marketers', 'real-estate-agents'],
  vapi: ['hair-stylists', 'general', 'plumbing', 'electricians', 'law', 'lawyers', 'marketers'],
  sms: ALL_INDUSTRIES,
  siri: ALL_INDUSTRIES,
  email_marketing: ['marketers', 'artists', 'creators', 'designers', 'hair-stylists', 'real-estate-agents', 'entrepreneurs'],
  social_inbox: ['marketers', 'hair-stylists', 'artists', 'creators', 'designers', 'real-estate-agents'],
  online_reviews: ['hair-stylists', 'marketers', 'general', 'plumbing', 'electricians', 'artists', 'creators'],
  site_audits: ['marketers', 'artists', 'creators', 'designers', 'hair-stylists', 'general', 'plumbing', 'entrepreneurs'],
  analytic_audit: ['marketers', 'artists', 'creators', 'designers', 'entrepreneurs'],
  site_monitoring: WEB_INDUSTRIES,
  uptime_monitoring: WEB_INDUSTRIES,
  fleet_tracking: TRADE_INDUSTRIES,
  materials_pricing: ['general', 'plumbing', 'electricians', 'engineers'],
  time_tracking: ['general', 'plumbing', 'electricians', 'engineers', 'law', 'lawyers'],
  real_estate_data: ['real-estate-agents'],
  dscr_calculator: ['real-estate-agents'],
  credit_check: ['real-estate-agents', 'law', 'lawyers', 'general'],
  inventory_sync: ['hair-stylists', 'marketers'],
  stock_photos: ['artists', 'creators', 'designers', 'marketers', 'real-estate-agents', 'hair-stylists'],
  wordpress_content: CREATIVE_INDUSTRIES,
  seo_directory: ['marketers', 'artists', 'creators', 'designers', 'hair-stylists', 'general', 'plumbing'],
  event_ticketing: ['marketers', 'artists', 'creators', 'designers', 'hair-stylists'],
  wayback_machine: ['artists', 'creators', 'designers', 'marketers', 'engineers'],
  namecom_dns: ['engineers', 'entrepreneurs', 'artists', 'creators', 'designers', 'marketers'],
  carddav: ['engineers', 'entrepreneurs'],
};

export function defaultIndustriesForFeature(feature: string): string[] {
  return expandIndustrySlugs(DEFAULT_MODULE_INDUSTRIES[feature] ?? []);
}

function priceFields(feature: FeatureId): Pick<CatalogRow, 'priceAmount' | 'priceLabel'> {
  const price = PAID_MODULE_PRICES[feature];
  if (!price || price.amount <= 0) {
    return { priceAmount: 0, priceLabel: isPrivateFeature(feature) || feature === 'demo' ? 'Internal' : 'Included' };
  }
  if (price.interval === 'year') return { priceAmount: price.amount, priceLabel: `$${price.amount}/yr` };
  if (price.interval === 'month') return { priceAmount: price.amount, priceLabel: `$${price.amount}/mo` };
  return { priceAmount: price.amount, priceLabel: `$${price.amount}` };
}

export function defaultModuleCatalog(): CatalogRow[] {
  const core: CatalogRow[] = CORE_OS_CARDS.map((card) => ({
    key: `core:${card.id}`,
    kind: 'core',
    group: 'core',
    id: catalogIdForCard(card.id) || '—',
    feature: card.id,
    label: card.label,
    blurb: card.blurb,
    priceAmount: null,
    priceLabel: 'Included',
    saleSheet: true,
    visibility: 'public',
    requires: [],
    industries: [],
  }));

  const modules: CatalogRow[] = FEATURE_IDS.filter((feature) => {
    if (feature === 'content_management') return false;
    if (BASELINE_FEATURE_SET.has(feature)) return false;
    return true;
  }).map((feature) => {
    const { priceAmount, priceLabel } = priceFields(feature);
    return {
      key: `module:${feature}`,
      kind: 'module' as const,
      group: catalogGroupForFeature(feature),
      id: catalogIdForFeature(feature) || '—',
      feature,
      label: FEATURE_LABELS[feature],
      blurb: feature === 'google_workspace' ? aggregatedGoogleWorkspaceBlurb() : FEATURE_BLURBS[feature],
      priceAmount,
      priceLabel,
      saleSheet: FEATURE_SALE_SHEET.has(feature),
      visibility: featureVisibility(feature),
      requires: featureRequirements(feature),
      industries: defaultIndustriesForFeature(feature),
    };
  });

  const groupRank = new Map(CATALOG_GROUPS.map((id, i) => [id, i]));
  return [...core, ...modules].sort((a, b) => {
    const gr = (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
    if (gr) return gr;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
}

export function isCatalogGroupId(value: string): value is CatalogGroupId {
  return (CATALOG_GROUPS as readonly string[]).includes(value);
}

export function slugifyCatalogFeature(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
