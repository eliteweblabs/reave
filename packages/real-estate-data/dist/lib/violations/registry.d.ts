/** Known municipal violation open-data feeds — keyed by normalized city,state. */
export type ViolationFeedConfig = {
    type: 'ckan';
    label: string;
    baseUrl: string;
    resourceId: string;
    fields: ViolationFieldMap;
    openStatusValues?: string[];
} | {
    type: 'socrata';
    label: string;
    domain: string;
    datasetId: string;
    fields: ViolationFieldMap;
    openStatusValues?: string[];
};
export type ViolationFieldMap = {
    id?: string;
    streetNumber?: string;
    street?: string;
    fullAddress?: string;
    city?: string;
    state?: string;
    zip?: string;
    status: string;
    description: string;
    category?: string;
    issuedAt?: string;
};
export declare const VIOLATION_FEEDS: Record<string, ViolationFeedConfig[]>;
export declare function listFeedCityKeys(): string[];
export declare function getFeedsForCity(cityKey: string): ViolationFeedConfig[];
//# sourceMappingURL=registry.d.ts.map