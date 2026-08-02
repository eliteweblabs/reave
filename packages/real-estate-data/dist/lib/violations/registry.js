export const VIOLATION_FEEDS = {
    'boston,ma': [
        {
            type: 'ckan',
            label: 'Analyze Boston — Building & Property Violations',
            baseUrl: 'https://data.boston.gov/api/3/action/datastore_search',
            resourceId: '800a2663-1d6a-46e7-9356-bedb70f5332c',
            fields: {
                id: 'case_no',
                streetNumber: 'violation_stno',
                street: 'violation_street',
                city: 'violation_city',
                state: 'violation_state',
                zip: 'violation_zip',
                status: 'status',
                description: 'description',
                category: 'code',
                issuedAt: 'status_dttm',
            },
            openStatusValues: ['Open', 'OPEN'],
        },
    ],
    'cambridge,ma': [
        {
            type: 'socrata',
            label: 'Cambridge Open Data — Housing Code Violations',
            domain: 'data.cambridgema.gov',
            datasetId: 'f8su-kv88',
            fields: {
                id: 'id',
                fullAddress: 'full_address',
                status: 'status',
                description: 'description',
                category: 'code',
                issuedAt: 'case_open_date',
            },
            openStatusValues: ['Open', 'Cited', 'Pending'],
        },
    ],
};
export function listFeedCityKeys() {
    return Object.keys(VIOLATION_FEEDS);
}
export function getFeedsForCity(cityKey) {
    return VIOLATION_FEEDS[cityKey] ?? [];
}
//# sourceMappingURL=registry.js.map