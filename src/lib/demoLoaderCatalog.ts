/**
 * Public demo loader catalog — uses deploy-status feed; toggles only when
 * the module is deployed and enabled on production Reave.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import { FEATURE_BLURBS, featureVisibility, isPublicFeature, isSaleSheetFeature } from './featureCatalog';
import { getProductionInstallFeatures, type InstallFeatureId } from './installConfig';
import { MODULE_DISPLAY_GROUPS } from './moduleDisplayGroups';
import {
  listDemoLoaderFeatures,
  listMarketingFeaturesForModule,
  type DemoLoaderFeature,
} from './marketingFeatures';

export type { DemoLoaderFeature } from './marketingFeatures';
export { listDemoLoaderFeatures } from './marketingFeatures';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  blurb: string;
  status: ModuleDeployStatus;
  /** Enabled on production Reave (config-reave.json features[]). */
  inProduction: boolean;
  /** Ready to include — deployed and on production Reave. */
  toggleable: boolean;
  /** Named capabilities from the module definition (FEATURE_MARKETING / MARKETING_FEATURES). */
  features: Array<{ id: string; label: string }>;
  /** Storefront visibility — private modules are never listed here. */
  visibility: 'public' | 'private';
  /** Leave-behind on the audit sales sheet. */
  saleSheet: boolean;
};

export type DemoLoaderIncludedCardDef = {
  id: string;
  label: string;
  blurb: string;
};

export type DemoLoaderIncludedCard = DemoLoaderIncludedCardDef & {
  /** Always-on Core OS — ships with every install. */
  baseline: true;
  /** Leave-behind on the audit sales sheet. */
  saleSheet: boolean;
};

export type DemoLoaderSection = {
  id: string;
  /** Section heading; null = no title block (ungrouped modules above named sections). */
  title: string | null;
  modules: DemoLoaderModule[];
};

function byTitle(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

/**
 * Core OS — always-on platform capabilities shown as marketing cards (not toggles).
 * This is the product baseline (portal / CRM / inbox — not FeatureId 004 billing).
 * Optional add-ons stay in FEATURE_IDS / the picker; these ship with every install.
 * Keep alphabetical by label (UI sorts as a safeguard too).
 */
export const DEMO_LOADER_INCLUDED_CARDS: readonly DemoLoaderIncludedCardDef[] = [
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

/**
 * Named section groups for optional modules in the public demo loader.
 * Features listed here are pulled out of the default list and rendered under the title
 * (in this array order). Remaining optionals sit under “Optional Modules”.
 */
export const DEMO_LOADER_SECTION_GROUPS = MODULE_DISPLAY_GROUPS;

/** Full module list for the public demo loader UI (baseline modules excluded). */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionFeatures = getProductionInstallFeatures();

  return listAllDeployModules()
    .map((m) => {
      const moduleId = demoModuleIdForFeature(m.feature);
      const deployed = m.status === 'deployed';
      const inProduction = productionFeatures.has(m.feature);
      return {
        moduleId,
        feature: m.feature,
        label: m.label,
        blurb: FEATURE_BLURBS[m.feature] ?? '',
        status: m.status,
        inProduction,
        toggleable: deployed && inProduction && Boolean(moduleId),
        features: listMarketingFeaturesForModule(m.feature).map((f) => ({
          id: f.id,
          label: f.label,
        })),
        visibility: featureVisibility(m.feature),
        saleSheet: isSaleSheetFeature(m.feature),
      };
    })
    .filter((m) => isPublicFeature(m.feature))
    .filter((m) => !m.moduleId || !isDemoBaselineModuleId(m.moduleId))
    // `website` is the public Agentic Website Editor; content_management is the same tile.
    .filter((m) => m.feature !== 'content_management')
    .sort(byTitle);
}

/** Culled marketing features (core + module-dependent + nav) for chips / slideshow. */
export function listDemoLoaderMarketingFeatures(): DemoLoaderFeature[] {
  return listDemoLoaderFeatures();
}

export function listDemoLoaderIncludedCards(): DemoLoaderIncludedCard[] {
  return DEMO_LOADER_INCLUDED_CARDS.map((card) => ({
    ...card,
    baseline: true as const,
    saleSheet: true,
  })).sort(byTitle);
}

/**
 * Named groups first (Social, E-commerce, Web Development), then leftover
 * optionals. Tiles within each section are alphabetical by title.
 */
export function listDemoLoaderSections(
  modules: readonly DemoLoaderModule[] = listDemoLoaderModules(),
): DemoLoaderSection[] {
  const byFeature = new Map(modules.map((m) => [m.feature, m]));
  const claimed = new Set<string>();

  const named: DemoLoaderSection[] = DEMO_LOADER_SECTION_GROUPS.map((group) => {
    const sectionModules: DemoLoaderModule[] = [];
    for (const feature of group.features) {
      const mod = byFeature.get(feature);
      if (!mod) continue;
      claimed.add(feature);
      sectionModules.push(mod);
    }
    sectionModules.sort(byTitle);
    return { id: group.id, title: group.title, modules: sectionModules };
  }).filter((s) => s.modules.length > 0);

  const ungrouped = modules.filter((m) => !claimed.has(m.feature)).sort(byTitle);
  const sections: DemoLoaderSection[] = [...named];
  if (ungrouped.length) {
    sections.push({ id: 'optional', title: 'Optional Modules', modules: ungrouped });
  }
  return sections;
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
