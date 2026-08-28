/**
 * Dashboard launcher cards for optional modules.
 *
 * A module appears on the admin home grid when it is enabled and listed here.
 * Title is always FEATURE_LABELS[id]. Icon is an IOS_ICONS / navIcon key.
 * Destination is the module’s primary footer/map key (not a footer-primary tab).
 */
import { FEATURE_IDS, FEATURE_LABELS, type FeatureId } from './featureCatalog.ts';
import { FEATURE_FOOTER_NAV } from './moduleNavMap.ts';

export type FeatureDashboardDef = {
  /** Whether this module gets a home-grid card when enabled. */
  dashboard: true;
  /** IOS_ICONS / navIcon key. */
  icon: string;
};

/** JSON-safe card the admin dashboard loops. */
export type DashboardCard = {
  id: string;
  title: string;
  icon: string;
  mapKey: string;
};

/**
 * Modules that own a dashboard tile. Unlisted modules never appear on the grid
 * even when enabled (they live in the footer, System, or settings).
 */
export const FEATURE_DASHBOARD: Partial<Record<FeatureId, FeatureDashboardDef>> = {
  social_inbox: { dashboard: true, icon: 'share' },
  online_reviews: { dashboard: true, icon: 'star' },
  email_marketing: { dashboard: true, icon: 'send' },
  documents: { dashboard: true, icon: 'file-text' },
  billing: { dashboard: true, icon: 'wallet' },
  analytic_audit: { dashboard: true, icon: 'bar-chart-2' },
  uptime_monitoring: { dashboard: true, icon: 'bar-chart-2' },
  content_management: { dashboard: true, icon: 'image' },
  website: { dashboard: true, icon: 'image' },
  deploy_wizard: { dashboard: true, icon: 'sparkles' },
  site_audits: { dashboard: true, icon: 'receipt' },
  fleet_tracking: { dashboard: true, icon: 'truck' },
  dscr_calculator: { dashboard: true, icon: 'calculator' },
};

/** Always-on OS surfaces that are not optional FeatureIds. */
export const CORE_DASHBOARD_CARDS: readonly DashboardCard[] = [
  { id: 'system', title: 'System', icon: 'monitor', mapKey: 'system' },
  { id: 'tooling', title: 'MCP & CLI', icon: 'wrench', mapKey: 'tooling' },
  { id: 'email-triage', title: 'Email triage', icon: 'git-branch', mapKey: 'email-triage' },
  { id: 'rules', title: 'Email Lab', icon: 'flask', mapKey: 'rules' },
  { id: 'knowledge', title: 'Knowledge', icon: 'book-open', mapKey: 'knowledge' },
  { id: 'media', title: 'Media Library', icon: 'image', mapKey: 'media' },
  { id: 'todo', title: 'To-do', icon: 'check-square', mapKey: 'todo' },
  { id: 'punchlist', title: 'Punch list', icon: 'list-checks', mapKey: 'punchlist' },
  { id: 'modules', title: 'Modules', icon: 'puzzle', mapKey: 'modules' },
];

/** Footer / settings destinations that should not become dashboard tiles. */
const SKIP_DASHBOARD_NAV = new Set([
  '__system__',
  '__chat__',
  'profile',
  'company',
  'work',
  'clients',
  'schedule',
  'dashboard',
]);

export function featureShowsDashboard(id: FeatureId): boolean {
  return FEATURE_DASHBOARD[id]?.dashboard === true;
}

export function dashboardMapKeyForFeature(id: FeatureId): string | null {
  const keys = FEATURE_FOOTER_NAV[id] ?? [];
  return keys.find((key) => !SKIP_DASHBOARD_NAV.has(key)) ?? null;
}

export function dashboardCardsForFeatures(
  features: readonly string[],
  opts: { showDeployWizard?: boolean } = {},
): DashboardCard[] {
  const enabled = new Set(features);
  const used = new Set<string>();
  const cards: DashboardCard[] = [];

  for (const core of CORE_DASHBOARD_CARDS) {
    cards.push(core);
  }

  for (const id of FEATURE_IDS) {
    if (!enabled.has(id)) continue;
    const def = FEATURE_DASHBOARD[id];
    if (!def?.dashboard) continue;
    if (id === 'deploy_wizard' && !opts.showDeployWizard) continue;
    const mapKey = dashboardMapKeyForFeature(id);
    // Feature tiles dedupe on destination. Core OS tiles (e.g. Media Library)
    // may share a mapKey with an optional module (Agentic Website Editor).
    if (!mapKey || used.has(mapKey)) continue;
    used.add(mapKey);
    cards.push({
      id,
      title: FEATURE_LABELS[id],
      icon: def.icon,
      mapKey,
    });
  }

  cards.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return cards;
}
