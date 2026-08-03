import type { PropertyDataProvider, PropertyRecord } from './types.js';
export type AttomRadiusSearchInput = {
    centerLat: number;
    centerLng: number;
    radiusMiles: number;
    pageSize?: number;
};
export declare function attomSearchRadius(input: AttomRadiusSearchInput): Promise<PropertyRecord[]>;
export declare const attomProvider: PropertyDataProvider;
//# sourceMappingURL=attom.d.ts.map