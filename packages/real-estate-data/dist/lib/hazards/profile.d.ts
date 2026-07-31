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
export declare function buildHazardProfile(property: Partial<PropertyRecord>, opts?: {
    wildfireLevel?: HazardLevel;
    recentStorm?: boolean;
    recentRebuild?: boolean;
}): HazardProfile;
//# sourceMappingURL=profile.d.ts.map