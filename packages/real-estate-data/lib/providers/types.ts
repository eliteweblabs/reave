/** Normalized property record returned by any provider. */
export type PropertyRecord = {
  /** Provider-native id (parcel id, property_id, etc.) */
  id: string;
  fullAddress: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  parcelId?: string;
  countyFips?: string;

  /** Structural */
  yearBuilt?: number | null;
  yearBuiltEffective?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  livingAreaSqft?: number | null;
  lotSizeSqft?: number | null;
  lotSizeAcres?: number | null;
  stories?: number | null;
  /** Per-floor area when the source provides it (rare in assessor data). */
  floorAreas?: Array<{ floor: number | string; sqft: number; label?: string }>;

  /** Classification */
  landUse?: string | null;
  landUseCategory?: string | null;
  propertyType?: string | null;
  zoning?: string | null;

  /** Ownership & valuation */
  ownerName?: string | null;
  mailingAddress?: string | null;
  marketValue?: number | null;
  assessedValue?: number | null;
  landValue?: number | null;
  improvementValue?: number | null;
  annualTax?: number | null;

  /** Sales */
  lastSalePrice?: number | null;
  lastSaleDate?: string | null;

  /** Risk / flags */
  floodZone?: string | null;
  absenteeOwner?: boolean | null;
  vacant?: boolean | null;

  /** Metadata */
  provider: ProviderId;
  matchLevel?: string;
  enrichmentStatus?: string;
  missingFields?: string[];
  raw?: unknown;
};

export type ComparableSale = {
  address: string;
  salePrice?: number | null;
  saleDate?: string | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  distanceMiles?: number | null;
};

export type PropertyLookupInput = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  parcelId?: string;
  countyFips?: string;
};

export type PropertyLookupResult =
  | { ok: true; properties: PropertyRecord[]; coverageStatus?: string }
  | { ok: false; error: string; code?: string };

export type CompsLookupInput = {
  address?: string;
  parcelId?: string;
  countyFips?: string;
  bedrooms?: number;
  limit?: number;
};

export type CompsLookupResult =
  | { ok: true; comps: ComparableSale[] }
  | { ok: false; error: string; code?: string };

export type ProviderId = 'mock' | 'propdata' | 'assessorsearch' | 'attom';

export interface PropertyDataProvider {
  id: ProviderId;
  configured: () => boolean;
  lookupProperty: (input: PropertyLookupInput) => Promise<PropertyLookupResult>;
  lookupComps?: (input: CompsLookupInput) => Promise<CompsLookupResult>;
}
