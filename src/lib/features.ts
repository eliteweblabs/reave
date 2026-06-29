/**
 * Deployment feature modules — enabled via FEATURES env (JSON string array).
 *
 * Example:
 *   FEATURES='["client_portal","billing","site_audits","site_monitoring","web_handoff"]'
 *
 * Core capabilities (contacts, email, knowledge, admin, work, GitHub/Railway dev
 * tools) are always on. Everything else is gated here.
 */
import { serverEnv } from './serverEnv';

/** Optional module ids — must match FEATURES JSON entries exactly. */
export const FEATURE_IDS = [
  'client_portal',
  'web_handoff',
  'billing',
  'site_audits',
  'site_monitoring',
  'documents',
  'voice',
  'carddav',
  'scheduling',
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
      if (FEATURE_SET.has(id)) {
        out.add(id as FeatureId);
      } else {
        console.warn(`[features] unknown module "${id}" — skipped`);
      }
    }
    return out;
  } catch {
    console.warn('[features] FEATURES is not valid JSON — ignoring');
    return new Set();
  }
}

/** Enabled optional modules for this deployment. */
export function enabledFeatures(): ReadonlySet<FeatureId> {
  if (!_cached) _cached = parseFeaturesEnv();
  return _cached;
}

export function hasFeature(id: FeatureId): boolean {
  return enabledFeatures().has(id);
}

/** Reset parse cache (tests / hot reload). */
export function clearFeatureCache(): void {
  _cached = null;
}

/** Human labels for admin / health output. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client portal (/c/:uid)',
  web_handoff: 'Portal Data tab (handoff creds)',
  billing: 'Crater billing',
  site_audits: 'Site audits (Lighthouse, SSL, DNS, links)',
  site_monitoring: 'Site change monitoring (ChangeDetection.io)',
  documents: 'Document signing',
  voice: 'Telnyx voice agent',
  carddav: 'CardDAV (iOS Contacts sync)',
  scheduling: 'Cal.com scheduling (bookings, admin schedule tab)',
};
