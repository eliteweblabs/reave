/** Normalize municipality / address strings for registry lookup. */
export declare function normalizeCityKey(city?: string | null, state?: string | null): string;
export declare function resolveFeedCityKey(city?: string | null, state?: string | null): string;
export type ParsedStreetAddress = {
    streetNumber: string;
    streetName: string;
};
export declare function parseStreetAddress(address: string): ParsedStreetAddress;
export declare function normalizeStreetToken(value: string): string;
export declare function mapViolationStatus(raw: string | null | undefined): 'open' | 'resolved' | 'unknown';
//# sourceMappingURL=normalize.d.ts.map