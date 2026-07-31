import type { PropertyDataProvider, PropertyLookupInput, PropertyLookupResult } from './types.js';

const MOCK_PROPERTIES: Record<string, PropertyLookupResult> = {
  '123 main street': {
    ok: true,
    coverageStatus: 'matched',
    properties: [
      {
        id: 'mock-123-main',
        fullAddress: '123 Main Street, Springfield, IL 62701',
        street: '123 Main Street',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        parcelId: '14-123-456',
        countyFips: '17167',
        yearBuilt: 1924,
        bedrooms: 4,
        bathrooms: 2.5,
        sqft: 2840,
        livingAreaSqft: 2840,
        lotSizeSqft: 7200,
        stories: 2,
        floorAreas: [
          { floor: 1, sqft: 1420, label: 'First floor' },
          { floor: 2, sqft: 1420, label: 'Second floor' },
        ],
        landUseCategory: 'Single Family Home',
        propertyType: 'SINGLE_FAMILY',
        zoning: 'R-1',
        ownerName: 'EXAMPLE HOLDINGS LLC',
        marketValue: 425000,
        assessedValue: 398000,
        annualTax: 8420,
        lastSalePrice: 380000,
        lastSaleDate: '2019-06-14',
        floodZone: 'X',
        provider: 'mock',
        matchLevel: 'mock_exact',
        enrichmentStatus: 'complete',
      },
    ],
  },
};

function normalizeKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bst\b\.?/g, 'street')
    .replace(/\bave\b\.?/g, 'avenue')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const mockProvider: PropertyDataProvider = {
  id: 'mock',
  configured: () => true,

  async lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const parts = [input.address, input.city, input.state, input.zip].filter(Boolean);
    const query = parts.join(', ').trim();
    if (!query && !input.parcelId) {
      return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
    }

    const key = normalizeKey(query || input.parcelId || '');
    for (const [mockKey, result] of Object.entries(MOCK_PROPERTIES)) {
      if (key.includes(mockKey) || mockKey.includes(key.split(',')[0]?.trim() ?? '')) {
        return result;
      }
    }

    return {
      ok: true,
      coverageStatus: 'not_found',
      properties: [],
    };
  },

  async lookupComps() {
    return {
      ok: true,
      comps: [
        {
          address: '115 Main Street, Springfield, IL 62701',
          salePrice: 410000,
          saleDate: '2024-03-22',
          sqft: 2650,
          yearBuilt: 1918,
          bedrooms: 4,
          bathrooms: 2,
          distanceMiles: 0.2,
        },
      ],
    };
  },
};
