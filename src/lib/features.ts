/**
 * Deployment feature modules — configured per install in config/config-{slug}.json.
 *
 * Legacy fallback: FEATURES env JSON array when install config has no features.
 */
import { getInstallConfigSync } from './installConfig.ts';
import { serverEnv } from './serverEnv';

/** Optional module ids — must match install config entries exactly. */
export const FEATURE_IDS = [
  'client_portal',
  'web_handoff',
  'billing',
  'site_audits',
  'site_monitoring',
  'uptime_monitoring',
  'documents',
  'voice',
  'vapi',
  'carddav',
  'scheduling',
  'dev_infra',
  'code_dev',
  'email_marketing',
  'fleet_tracking',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

const FEATURE_SET = new Set<string>(FEATURE_IDS);

let _cached: Set<FeatureId> | null = null;

function parseFeaturesEnv(): Set<FeatureId> {
  const raw = serverEnv('FEATURES')?.trim();
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn('[features] FEATURES must be a JSON array — ignoring');
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
    console.warn('[features] FEATURES is not valid JSON — ignoring');
    return new Set();
  }
}

function bootstrapEnabled(): Set<FeatureId> {
  const fromInstall = getInstallConfigSync().features;
  if (fromInstall.length) return new Set(fromInstall);
  return parseFeaturesEnv();
}

/** Enabled optional modules for this deployment. */
export function enabledFeatures(): ReadonlySet<FeatureId> {
  if (!_cached) _cached = bootstrapEnabled();
  return _cached;
}

export function hasFeature(id: FeatureId): boolean {
  return enabledFeatures().has(id);
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _cached = null;
}

/** Human labels for health output and docs. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client portal (/c/:uid)',
  web_handoff: 'Portal Data tab (handoff creds)',
  billing: 'Crater billing & invoices',
  site_audits: 'Site audits (Lighthouse, SSL, DNS, links)',
  site_monitoring: 'Site change monitoring (ChangeDetection.io)',
  uptime_monitoring: 'Uptime monitoring (UptimeRobot)',
  documents: 'Document signing templates',
  voice: 'Telnyx voice agent',
  vapi: 'Vapi assistant (admin sync & branding)',
  carddav: 'CardDAV (iOS Contacts sync)',
  scheduling: 'Cal.com scheduling & meetings',
  dev_infra: 'Dev & infrastructure (Git, Railway, Kinsta, deploy)',
  code_dev: 'Local code tools (read/write/list/exec) — Reave install only',
  email_marketing: 'Newsletter & email automation (welcome, follow-ups, review requests, broadcasts)',
  fleet_tracking: 'Fleet tracking (multi-vehicle GPS via fleet-api)',
};

export const CORE_FEATURE_NOTE =
  'Contacts, email inbox, work/jobs, knowledge, personal to-dos, and chat are always on.';
