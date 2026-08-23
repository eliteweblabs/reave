import { projectRoot } from './projectRoot';
/**
 * Per-module deployment status — playbooks in plugin DEPLOY.md files and
 * config/modules playbooks; per-install overrides in config/config-{slug}.json.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { demoModuleDeployStatus, demoShouldShowDeployBanner } from './demoFeatures.ts';
import { isDemoMode } from './demoMode.ts';
import { FEATURE_IDS, FEATURE_LABELS, hasFeature, type FeatureId } from './features.ts';
import { featureVisibility, isPrivateFeature, type FeatureVisibility } from './featureCatalog.ts';
import { getInstallConfigSync } from './installConfig.ts';
import { getPlugin, isPluginActive, REAVE_PLUGINS } from './pluginRegistry.ts';

export const MODULE_DEPLOY_STATUSES = [
  'deployed',
  'development',
  'request',
  'rejected',
] as const;

export type ModuleDeployStatus = (typeof MODULE_DEPLOY_STATUSES)[number];

const STATUS_SET = new Set<string>(MODULE_DEPLOY_STATUSES);

export type DeployModulePlaybook = {
  feature: FeatureId;
  pluginId: string | null;
  path: string;
  defaultStatus: ModuleDeployStatus;
  stage: 1 | 2 | 3;
  title: string;
  body: string;
};

export type DeployModuleSnapshot = DeployModulePlaybook & {
  label: string;
  enabled: boolean;
  status: ModuleDeployStatus;
  active: boolean;
  configured: boolean;
  runtimeAllowed: boolean;
  showBanner: boolean;
  visibility: FeatureVisibility;
};

let _playbooksCached: DeployModulePlaybook[] | null = null;


function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) meta[key] = value;
  }
  return { meta, body: match[2]!.trim() };
}

function normalizeStatus(raw: string | undefined, fallback: ModuleDeployStatus): ModuleDeployStatus {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'pending') return 'development';
  if (v === 'requested') return 'request';
  if (STATUS_SET.has(v)) return v as ModuleDeployStatus;
  return fallback;
}

function normalizeStage(raw: string | undefined): 1 | 2 | 3 {
  const n = Number.parseInt((raw ?? '3').trim(), 10);
  if (n === 1 || n === 2) return n;
  return 3;
}

function readPlaybookFile(absPath: string, pluginId: string | null): DeployModulePlaybook | null {
  try {
    const raw = readFileSync(absPath, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const feature = (meta.feature ?? '').trim();
    if (!FEATURE_IDS.includes(feature as FeatureId)) return null;
    const titleMatch = body.match(/^#\s+(.+)$/m);
    return {
      feature: feature as FeatureId,
      pluginId,
      path: absPath.replace(projectRoot() + '/', ''),
      defaultStatus: normalizeStatus(meta.defaultStatus, 'development'),
      stage: normalizeStage(meta.stage),
      title: titleMatch?.[1]?.trim() ?? FEATURE_LABELS[feature as FeatureId],
      body,
    };
  } catch {
    return null;
  }
}

function scanPlaybooks(): DeployModulePlaybook[] {
  const root = projectRoot();
  const out: DeployModulePlaybook[] = [];
  const byFeature = new Map<FeatureId, DeployModulePlaybook>();

  const pluginsDir = join(root, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
      const deployPath = join(pluginsDir, dir.name, 'DEPLOY.md');
      if (!existsSync(deployPath)) continue;
      const pb = readPlaybookFile(deployPath, dir.name);
      if (pb) byFeature.set(pb.feature, pb);
    }
  }

  const modulesDir = join(root, 'config', 'modules');
  if (existsSync(modulesDir)) {
    for (const file of readdirSync(modulesDir)) {
      if (!file.endsWith('.DEPLOY.md')) continue;
      const pb = readPlaybookFile(join(modulesDir, file), null);
      if (pb) byFeature.set(pb.feature, pb);
    }
  }

  for (const id of FEATURE_IDS) {
    const pb = byFeature.get(id);
    if (pb) out.push(pb);
  }
  return out;
}

export function listDeployPlaybooks(): DeployModulePlaybook[] {
  if (!_playbooksCached) _playbooksCached = scanPlaybooks();
  return _playbooksCached;
}

function installStatusOverride(feature: FeatureId): ModuleDeployStatus | undefined {
  const raw = getInstallConfigSync().moduleStatus?.[feature];
  if (!raw) return undefined;
  return normalizeStatus(raw, 'development');
}

function playbookFor(feature: FeatureId): DeployModulePlaybook | undefined {
  return listDeployPlaybooks().find((p) => p.feature === feature);
}

export function getModuleDeployStatus(feature: FeatureId): ModuleDeployStatus {
  if (isDemoMode()) return demoModuleDeployStatus(feature);
  const override = installStatusOverride(feature);
  if (override) return override;
  const pb = playbookFor(feature);
  if (pb) return pb.defaultStatus;
  return 'development';
}

function isConfigured(feature: FeatureId): boolean {
  const plugin = REAVE_PLUGINS.find((p) => p.feature === feature);
  if (plugin) {
    if (!hasFeature(feature)) return false;
    if (plugin.configured) return plugin.configured();
    return true;
  }
  return hasFeature(feature);
}

export function isModuleRuntimeAllowed(feature: FeatureId): boolean {
  if (!hasFeature(feature)) return false;
  const status = getModuleDeployStatus(feature);
  if (status === 'rejected' || status === 'request') return false;
  return true;
}

export function shouldShowDeployBanner(feature: FeatureId): boolean {
  if (!hasFeature(feature)) return false;
  if (isDemoMode()) return demoShouldShowDeployBanner(feature);
  // Only installs that explicitly track moduleStatus (new client rollouts) show the banner.
  // Production configs like config-reave.json omit moduleStatus — modules are live or disabled via features[].
  // Banner is for production-level setup in progress only (`development`), not wishlist
  // (`request`) or finished/rejected modules. Product WIP stays on playbook defaultStatus.
  const raw = getInstallConfigSync().moduleStatus?.[feature];
  if (raw === undefined) return false;
  const status = normalizeStatus(raw, 'development');
  return status === 'development';
}

export function getUndeployedEnabledModules(): DeployModuleSnapshot[] {
  return listAllDeployModules().filter((m) => m.enabled && m.showBanner);
}

export function listAllDeployModules(): DeployModuleSnapshot[] {
  const playbooks = listDeployPlaybooks();
  const playbookByFeature = new Map(playbooks.map((p) => [p.feature, p]));

  return FEATURE_IDS.filter((feature) => !isPrivateFeature(feature) || hasFeature(feature)).map((feature) => {
    const pb = playbookByFeature.get(feature);
    const plugin = getPlugin(REAVE_PLUGINS.find((p) => p.feature === feature)?.id ?? '');
    const enabled = hasFeature(feature);
    const status = getModuleDeployStatus(feature);
    const runtimeAllowed = isModuleRuntimeAllowed(feature);
    const active = plugin ? isPluginActive(plugin) : enabled && runtimeAllowed;
    return {
      feature,
      pluginId: pb?.pluginId ?? plugin?.id ?? null,
      path: pb?.path ?? '',
      defaultStatus: pb?.defaultStatus ?? 'development',
      stage: pb?.stage ?? 3,
      title: pb?.title ?? FEATURE_LABELS[feature],
      body: pb?.body ?? '',
      label: FEATURE_LABELS[feature],
      enabled,
      status,
      active,
      configured: isConfigured(feature),
      runtimeAllowed,
      showBanner: shouldShowDeployBanner(feature),
      visibility: featureVisibility(feature),
    };
  });
}

export function getDeployStatusClientSummary(): {
  modules: Array<{
    id: FeatureId;
    label: string;
    status: ModuleDeployStatus;
    showBanner: boolean;
  }>;
  hasBanner: boolean;
} {
  const modules = getUndeployedEnabledModules().map((m) => ({
    id: m.feature,
    label: m.label,
    status: m.status,
    showBanner: m.showBanner,
  }));
  return { modules, hasBanner: modules.length > 0 };
}
