/** Known municipal violation open-data feeds — keyed by normalized city,state. */
export type ViolationFeedConfig =
  | {
      type: 'ckan';
      label: string;
      baseUrl: string;
      resourceId: string;
      fields: ViolationFieldMap;
      openStatusValues?: string[];
    }
  | {
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

export const VIOLATION_FEEDS: Record<string, ViolationFeedConfig[]> = {
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

export function listFeedCityKeys(): string[] {
  return Object.keys(VIOLATION_FEEDS);
}

export function getFeedsForCity(cityKey: string): ViolationFeedConfig[] {
  return VIOLATION_FEEDS[cityKey] ?? [];
}
