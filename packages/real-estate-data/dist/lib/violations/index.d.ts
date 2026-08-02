import { type ServiceAreaConfig, type ServiceAreaMunicipality } from './places.js';
import type { ViolationLookupResult } from './types.js';
export { mockViolationsProvider } from './mock.js';
export type ViolationLookupOptions = {
    /** When set, only municipalities in this service area are queried (from company office). */
    serviceArea?: ServiceAreaConfig;
    socrataAppToken?: string;
};
export type ViolationServiceAreaSummary = {
    center: {
        lat: number;
        lng: number;
    };
    radiusMiles: number;
    topPercent: number;
    municipalityCount: number;
    feedCount: number;
    municipalities: ServiceAreaMunicipality[];
};
export declare function describeViolationServiceArea(config: ServiceAreaConfig): ViolationServiceAreaSummary;
export declare function lookupViolations(input: {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
}, options?: ViolationLookupOptions): Promise<ViolationLookupResult>;
//# sourceMappingURL=index.d.ts.map