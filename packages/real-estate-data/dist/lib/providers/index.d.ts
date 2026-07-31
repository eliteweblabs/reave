import type { CompsLookupInput, CompsLookupResult, PropertyDataProvider, PropertyLookupInput, PropertyLookupResult, ProviderId } from './types.js';
export declare function getActiveProvider(): PropertyDataProvider;
export declare function listProviders(): Array<{
    id: ProviderId;
    configured: boolean;
}>;
export declare function lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult>;
export declare function lookupComps(input: CompsLookupInput): Promise<CompsLookupResult>;
export type { PropertyRecord, PropertyLookupInput, CompsLookupInput } from './types.js';
//# sourceMappingURL=index.d.ts.map