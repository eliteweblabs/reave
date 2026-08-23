/**
 * Default module catalog for the super-admin Catalog page.
 * Runtime edits live in moduleCatalogStore (Postgres / JSON overlay).
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import {
  FEATURE_BLURBS,
  FEATURE_IDS,
  FEATURE_LABELS,
  FEATURE_SALE_SHEET,
  featureVisibility,
  isPrivateFeature,
  type FeatureId,
} from './featureCatalog';
import { MODULE_DISPLAY_GROUPS } from './moduleDisplayGroups';
import { PAID_MODULE_PRICES } from './moduleStorefront';

export const CATALOG_GROUPS = [
  'core',
  'work',
  'social',
  'e-commerce',
  'web-development',
  'other',
  'internal',
] as const;

export type CatalogGroupId = (typeof CATALOG_GROUPS)[number];

export const CATALOG_GROUP_TITLES: Record<CatalogGroupId, string> = {
  core: 'Core OS',
  work: 'Work',
  social: 'Social',
  'e-commerce': 'E-commerce',
  'web-development': 'Web Development',
  other: 'Other',
  internal: 'Internal',
};

export type CatalogRowKind = 'core' | 'module' | 'custom';

/** Core OS marketing cards — also re-exported as DEMO_LOADER_INCLUDED_CARDS. */
export const CORE_OS_CARDS: readonly { id: string; label: string; blurb: string }[] = [
  {
    id: 'web-search',
    label: 'Agentic Web Search',
    blurb: 'Live public lookup when knowledge isn’t enough — businesses, people, and sites.',
  },
  {
    id: 'agent-chat',
    label: 'Agentic Chat',
    blurb: 'Your always-on operations assistant — runs tools, files work, and follows playbooks.',
  },
  {
    id: 'chat-commands',
    label: 'Chat / commands',
    blurb: 'Type / in agent chat for slash commands — knowledge, jobs, billing, and the rest of the OS.',
  },
  {
    id: 'business-audit',
    label: 'Business Audit',
    blurb: 'Automated presence & reputation review — GBP, reviews, NAP, and content.',
  },
  {
    id: 'client-portal',
    label: 'Client Portal',
    blurb: 'A branded portal for every client — projects, files, and status in one place.',
  },
  {
    id: 'crm',
    label: 'CRM',
    blurb: 'Contacts, companies, and client profiles — searchable by name, phone, or domain.',
  },
  {
    id: 'dynamic-todos',
    label: 'Dynamic To-Dos',
    blurb: 'Dynamic alerts for personal or work — create, update, and clear with the agent or Siri.',
  },
  {
    id: 'email-inbox',
    label: 'Inbox Triage',
    blurb: 'Triage client mail, draft replies, and file threads onto the right project.',
  },
  {
    id: 'handoff-vault',
    label: 'Handoff Vault',
    blurb: 'Bidirectionally share secure credentials and other data in the portal Data tab.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Base',
    blurb: 'Playbooks the agent actually follows — SOPs, install notes, and how-tos on demand.',
  },
  {
    id: 'media-library',
    label: 'Media Library',
    blurb: 'Upload and reuse logos, photos, and PDFs for branding and content — pick once, use everywhere.',
  },
  {
    id: 'passkeys',
    label: 'Passkeys & Face ID',
    blurb: 'Sign in with Face ID, Touch ID, or a device passkey after the first visit — no password on return.',
  },
  {
    id: 'phone-sign-in',
    label: 'Phone sign-in',
    blurb: 'Sign in with a one-time code texted to your phone — separate from two-way business SMS.',
  },
  {
    id: 'portal-assistant',
    label: 'Portal Assistant',
    blurb: 'Speed-dial help chat so clients get answers without ringing your phone.',
  },
  {
    id: 'projects',
    label: 'Projects & Work',
    blurb: 'Jobs, inquiry notes, and delivery tracking with full agent read/write.',
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
  visibility: 'public' | 'private';
};

function featureGroup(feature: FeatureId): CatalogGroupId {
  if (isPrivateFeature(feature) || feature === 'demo') return 'internal';
  const grouped = MODULE_DISPLAY_GROUPS.find((g) => g.features.includes(feature));
  if (grouped?.id === 'work') return 'work';
  if (grouped?.id === 'social') return 'social';
  if (grouped?.id === 'e-commerce') return 'e-commerce';
  if (grouped?.id === 'web-development') return 'web-development';
  return 'other';
}

function priceFields(feature: FeatureId): Pick<CatalogRow, 'priceAmount' | 'priceLabel'> {
  const price = PAID_MODULE_PRICES[feature];
  if (!price || price.amount <= 0) {
    return { priceAmount: 0, priceLabel: isPrivateFeature(feature) || feature === 'demo' ? 'Internal' : 'Included' };
  }
  return { priceAmount: price.amount, priceLabel: `$${price.amount}` };
}

export function defaultModuleCatalog(): CatalogRow[] {
  const core: CatalogRow[] = CORE_OS_CARDS.map((card) => ({
    key: `core:${card.id}`,
    kind: 'core',
    group: 'core',
    id: '—',
    feature: card.id,
    label: card.label,
    blurb: card.blurb,
    priceAmount: null,
    priceLabel: 'Included',
    saleSheet: true,
    visibility: 'public',
  }));

  const modules: CatalogRow[] = FEATURE_IDS.filter((feature) => {
    if (feature === 'content_management') return false;
    const moduleId = demoModuleIdForFeature(feature);
    if (moduleId && isDemoBaselineModuleId(moduleId)) return false;
    return true;
  }).map((feature) => {
    const moduleId = demoModuleIdForFeature(feature);
    const { priceAmount, priceLabel } = priceFields(feature);
    return {
      key: `module:${feature}`,
      kind: 'module' as const,
      group: featureGroup(feature),
      id: moduleId || '—',
      feature,
      label: FEATURE_LABELS[feature],
      blurb: FEATURE_BLURBS[feature],
      priceAmount,
      priceLabel,
      saleSheet: FEATURE_SALE_SHEET.has(feature),
      visibility: featureVisibility(feature),
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
