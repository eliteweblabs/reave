/**
 * Deployment feature modules — toggled in Admin → Plugins (persisted) with optional
 * FEATURES env bootstrap on first deploy.
 *
 * Example bootstrap:
 *   FEATURES='["client_portal","billing","site_audits","scheduling","dev_infra"]'
 */
import { readStoredFeaturesSync, getStoredFeatures, clearStoredFeaturesCache } from './featureStore';
import { serverEnv } from './serverEnv';
import { createLogger } from './logger';

const log = createLogger('features');

/** Optional module ids — must match stored JSON entries exactly. */
export const FEATURE_IDS = [
  'client_portal',
  'web_handoff',
  'billing',
  'site_audits',
  'site_monitoring',
  'uptime_monitoring',
  'documents',
  'voice',
  'carddav',
  'scheduling',
  'dev_infra',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

const FEATURE_SET = new Set<string>(FEATURE_IDS);

let _cached: Set<FeatureId> | null = null;
let _hydrateStarted = false;

function parseFeaturesEnv(): Set<FeatureId> {
  const raw = serverEnv('FEATURES')?.trim();
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      log.warn('FEATURES must be a JSON array — ignoring');
      return new Set();
    }
    const out = new Set<FeatureId>();
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const id = item.trim();
      if (FEATURE_SET.has(id)) out.add(id as FeatureId);
    }
    return out;
  } catch {
    log.warn('FEATURES is not valid JSON — ignoring');
    return new Set();
  }
}

function bootstrapEnabled(): Set<FeatureId> {
  const stored = readStoredFeaturesSync();
  if (stored && stored.length) return new Set(stored);
  return parseFeaturesEnv();
}

function hydrateFromStoreAsync(): void {
  if (_hydrateStarted) return;
  _hydrateStarted = true;
  void getStoredFeatures().then((stored) => {
    if (stored && stored.length) {
      _cached = new Set(stored);
    }
  });
}

/** Enabled optional modules for this deployment. */
export function enabledFeatures(): ReadonlySet<FeatureId> {
  if (!_cached) {
    _cached = bootstrapEnabled();
    hydrateFromStoreAsync();
  }
  return _cached;
}

export function hasFeature(id: FeatureId): boolean {
  return enabledFeatures().has(id);
}

/** Replace in-memory enabled set (after admin save). */
export function setEnabledFeatures(ids: FeatureId[]): void {
  _cached = new Set(ids);
  clearStoredFeaturesCache();
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _cached = null;
  _hydrateStarted = false;
  clearStoredFeaturesCache();
}

/** Human labels for admin / health output. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client portal (/c/:uid)',
  web_handoff: 'Portal Data tab (handoff creds)',
  billing: 'Crater billing & invoices',
  site_audits: 'Site audits (Lighthouse, SSL, DNS, links)',
  site_monitoring: 'Site change monitoring (ChangeDetection.io)',
  uptime_monitoring: 'Uptime monitoring (UptimeRobot)',
  documents: 'Document signing templates',
  voice: 'Telnyx voice agent',
  carddav: 'CardDAV (iOS Contacts sync)',
  scheduling: 'Cal.com scheduling & meetings',
  dev_infra: 'Dev & infrastructure (Git, Railway, Kinsta, deploy)',
};

export const FEATURE_GROUPS: { id: string; title: string; features: FeatureId[] }[] = [
  {
    id: 'client',
    title: 'Client-facing',
    features: ['client_portal', 'web_handoff', 'billing', 'documents', 'scheduling', 'carddav'],
  },
  {
    id: 'ops',
    title: 'Operations & monitoring',
    features: ['site_audits', 'site_monitoring', 'uptime_monitoring', 'voice'],
  },
  {
    id: 'dev',
    title: 'Dev & infrastructure',
    features: ['dev_infra'],
  },
];

export const CORE_FEATURE_NOTE =
  'Contacts, email inbox, work/jobs, knowledge, personal to-dos, and chat are always on.';
