import type { PropertyRecord } from './providers/types.js';
export type FloorAreaQuery = {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    floor?: number | string;
    floorLabel?: string;
};
export type FloorAreaResult = {
    ok: true;
    floor?: number | string;
    sqft: number;
    source: 'floor_areas' | 'estimated_even_split' | 'total_building_only';
    property: PropertyRecord;
    note?: string;
} | {
    ok: false;
    error: string;
    code?: string;
};
/**
 * Resolve per-floor square footage when available.
 * Most assessor APIs only return total building sqft — per-floor data is uncommon.
 */
export declare function getFloorArea(input: FloorAreaQuery): Promise<FloorAreaResult>;
export { lookupProperty, lookupComps, getActiveProvider, listProviders } from './providers/index.js';
export { isRealEstateDataConfigured, loadConfig } from './config.js';
//# sourceMappingURL=propertyService.d.ts.map