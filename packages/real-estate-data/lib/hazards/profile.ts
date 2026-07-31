import type { PropertyRecord } from '../providers/types.js';

export type HazardLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';

export type HazardProfile = {
  flood: {
    zone: string | null;
    level: HazardLevel;
    note?: string;
  };
  wildfire: {
    level: HazardLevel;
    note?: string;
  };
  fireDamage: {
    /** Recorded rebuild/fire permit — not insurance claims. */
    recentRebuild: boolean;
    note: string;
  };
  storm: {
    recentEvent: boolean;
    note?: string;
  };
};

const WILDFIRE_PRONE_STATES = new Set(['CA', 'CO', 'OR', 'WA', 'AZ', 'NM', 'MT', 'ID', 'NV', 'UT']);

function floodLevelFromZone(zone: string | null | undefined): HazardLevel {
  if (!zone) return 'none';
  const z = zone.toUpperCase();
  if (z.startsWith('V') || z.startsWith('VE')) return 'severe';
  if (z.startsWith('A') || z.includes('AE') || z.includes('AH')) return 'high';
  if (z.startsWith('X') && z.includes('SHADED')) return 'moderate';
  if (z.startsWith('X')) return 'low';
  if (z.startsWith('D')) return 'moderate';
  return 'low';
}

export function buildHazardProfile(
  property: Partial<PropertyRecord>,
  opts?: { wildfireLevel?: HazardLevel; recentStorm?: boolean; recentRebuild?: boolean },
): HazardProfile {
  const state = (property.state ?? '').toUpperCase();
  const floodZone = property.floodZone ?? null;

  let wildfireLevel: HazardLevel = opts?.wildfireLevel ?? 'none';
  if (wildfireLevel === 'none' && WILDFIRE_PRONE_STATES.has(state)) {
    wildfireLevel = 'moderate';
  }

  return {
    flood: {
      zone: floodZone,
      level: floodLevelFromZone(floodZone),
      note: floodZone
        ? `FEMA flood zone ${floodZone}`
        : 'Flood zone not available from current data source',
    },
    wildfire: {
      level: wildfireLevel,
      note:
        wildfireLevel !== 'none'
          ? `${state || 'This state'} has elevated wildfire risk regions — verify local fire hazard severity maps.`
          : 'Wildfire risk not elevated for this state in our baseline model.',
    },
    fireDamage: {
      recentRebuild: opts?.recentRebuild ?? false,
      note:
        'Insurance fire claims are not public. Rebuild permits or disaster declarations may indicate past fire damage.',
    },
    storm: {
      recentEvent: opts?.recentStorm ?? false,
      note: opts?.recentStorm ? 'Recent storm event flagged in scan context.' : undefined,
    },
  };
}
