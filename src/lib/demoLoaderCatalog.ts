/**
 * Public demo loader catalog — uses deploy-status feed; toggles only when status is deployed.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import type { FeatureId } from './featureCatalog';
import { getProductionInstallFeatures, type InstallFeatureId } from './installConfig';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  status: ModuleDeployStatus;
  /** Enabled on production Reave (config-reave.json features[]). */
  inProduction: boolean;
  /** Ready for demo — deploy playbook status is deployed. */
  toggleable: boolean;
};

export type DemoLoaderIncludedCard = {
  id: string;
  label: string;
  blurb: string;
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
 * Always-on platform capabilities shown as marketing cards (not toggles).
 * Baseline portal modules + core agent tools that ship with every demo.
 * Keep alphabetical by label (UI sorts as a safeguard too).
 */
export const DEMO_LOADER_INCLUDED_CARDS: readonly DemoLoaderIncludedCard[] = [
  {
    id: 'web-search',
    label: 'Agent Web Search',
    blurb: 'Live public lookup when knowledge isn’t enough — businesses, people, and sites.',
  },
  {
    id: 'agent-chat',
    label: 'AI Agent Chat',
    blurb: 'Your always-on operations assistant — runs tools, files work, and follows playbooks.',
  },
  {
    id: 'billing',
    label: 'Billing & Invoices',
    blurb: 'Quotes, invoices, and payments wired to the work you’re already shipping.',
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
    label: 'Email Inbox',
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
export const DEMO_LOADER_SECTION_GROUPS: ReadonlyArray<{
  id: string;
  title: string;
  features: readonly FeatureId[];
}> = [
  {
    id: 'web-development',
    title: 'Web Development Modules',
    features: [
      'site_audits',
      'dev_infra',
      'code_dev',
      'namecom_dns',
      'site_monitoring',
      'wayback_machine',
    ],
  },
];

/** Full module list for the public demo loader UI (baseline modules excluded). */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionFeatures = getProductionInstallFeatures();

  return listAllDeployModules()
    .map((m) => {
      const moduleId = demoModuleIdForFeature(m.feature);
      const deployed = m.status === 'deployed';
      return {
        moduleId,
        feature: m.feature,
        label: m.label,
        status: m.status,
        inProduction: productionFeatures.has(m.feature),
        toggleable: deployed && Boolean(moduleId),
      };
    })
    .filter((m) => !m.moduleId || !isDemoBaselineModuleId(m.moduleId))
    .sort(byTitle);
}

export function listDemoLoaderIncludedCards(): DemoLoaderIncludedCard[] {
  return [...DEMO_LOADER_INCLUDED_CARDS].sort(byTitle);
}

/**
 * Optional sections: “Optional Modules” (remaining) then named groups such as
 * Web Development Modules. Tiles within each section are alphabetical by title.
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
  const sections: DemoLoaderSection[] = [];
  if (ungrouped.length) {
    sections.push({ id: 'optional', title: 'Optional Modules', modules: ungrouped });
  } else if (named.length) {
    // Keep the Optional Modules heading even when everything is in named groups.
    sections.push({ id: 'optional', title: 'Optional Modules', modules: [] });
  }
  sections.push(...named);
  return sections;
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
