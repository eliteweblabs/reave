import { loadConfig } from '../config.js';
import type {
  ComparableSale,
  PropertyDataProvider,
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyRecord,
} from './types.js';

type PropDataPropertyResult = {
  parcel_id?: string;
  county_fips?: string;
  full_address?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  owner_name?: string;
  mailing_address?: string;
  market_value?: number;
  assessed_value?: number;
  last_sale_price?: number;
  last_sale_date?: string;
  annual_tax?: number;
  property?: {
    sqft?: number;
    year_built?: number;
    beds?: number;
    baths?: number;
    stories?: number;
  };
  flags?: { is_absentee_owner?: boolean; is_vacant?: boolean };
  fema_flood_zone?: string;
  match_level?: string;
};

type PropDataResponse = {
  results?: PropDataPropertyResult[];
  coverage_status?: string;
  enrichment_status?: string;
  missing_fields?: string[];
  error?: string;
  message?: string;
};

function mapResult(row: PropDataPropertyResult): PropertyRecord {
  return {
    id: row.parcel_id ?? row.full_address ?? 'unknown',
    fullAddress: row.full_address ?? [row.address, row.city, row.state, row.zip].filter(Boolean).join(', '),
    street: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    parcelId: row.parcel_id,
    countyFips: row.county_fips,
    yearBuilt: row.property?.year_built ?? null,
    bedrooms: row.property?.beds ?? null,
    bathrooms: row.property?.baths ?? null,
    sqft: row.property?.sqft ?? null,
    livingAreaSqft: row.property?.sqft ?? null,
    stories: row.property?.stories ?? null,
    ownerName: row.owner_name ?? null,
    mailingAddress: row.mailing_address ?? null,
    marketValue: row.market_value ?? null,
    assessedValue: row.assessed_value ?? null,
    annualTax: row.annual_tax ?? null,
    lastSalePrice: row.last_sale_price ?? null,
    lastSaleDate: row.last_sale_date ?? null,
    floodZone: row.fema_flood_zone ?? null,
    absenteeOwner: row.flags?.is_absentee_owner ?? null,
    vacant: row.flags?.is_vacant ?? null,
    provider: 'propdata',
    matchLevel: row.match_level,
    raw: row,
  };
}

async function propDataFetch(path: string, params: Record<string, string>): Promise<Response> {
  const cfg = loadConfig().propdata;
  const url = new URL(path, cfg.baseUrl.replace(/\/$/, '') + '/');
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return fetch(url.toString(), {
    headers: {
      'x-api-key': cfg.apiKey,
      Accept: 'application/json',
    },
  });
}

export const propdataProvider: PropertyDataProvider = {
  id: 'propdata',
  configured: () => !!loadConfig().propdata.apiKey,

  async lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const params: Record<string, string> = {};
    if (input.parcelId) {
      params.parcel = input.countyFips ? `${input.countyFips}-${input.parcelId}` : input.parcelId;
    } else {
      const address = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ');
      if (!address.trim()) {
        return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
      }
      params.address = address;
    }

    let res: Response;
    try {
      res = await propDataFetch('/v1/property', params);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'PropData request failed', code: 'NETWORK' };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `PropData ${res.status}: ${text.slice(0, 300)}`, code: 'HTTP_ERROR' };
    }

    const data = (await res.json()) as PropDataResponse;
    if (data.error || data.message) {
      return { ok: false, error: data.error ?? data.message ?? 'PropData error', code: 'PROVIDER_ERROR' };
    }

    const properties = (data.results ?? []).map(mapResult);
    return {
      ok: true,
      properties,
      coverageStatus: data.coverage_status,
    };
  },

  async lookupComps(input) {
    const params: Record<string, string> = { limit: String(input.limit ?? 10) };
    if (input.parcelId) {
      params.parcel = input.countyFips ? `${input.countyFips}-${input.parcelId}` : input.parcelId;
    } else if (input.address) {
      params.address = input.address;
    } else {
      return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
    }
    if (input.bedrooms != null) params.beds = String(input.bedrooms);

    let res: Response;
    try {
      res = await propDataFetch('/v1/comps', params);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'PropData comps request failed', code: 'NETWORK' };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `PropData comps ${res.status}: ${text.slice(0, 300)}`, code: 'HTTP_ERROR' };
    }

    const data = (await res.json()) as { results?: Array<Record<string, unknown>>; error?: string };
    if (data.error) return { ok: false, error: data.error, code: 'PROVIDER_ERROR' };

    const comps: ComparableSale[] = (data.results ?? []).map((row) => ({
      address: String(row.full_address ?? row.address ?? ''),
      salePrice: typeof row.sale_price === 'number' ? row.sale_price : null,
      saleDate: typeof row.sale_date === 'string' ? row.sale_date : null,
      sqft: typeof row.sqft === 'number' ? row.sqft : null,
      yearBuilt: typeof row.year_built === 'number' ? row.year_built : null,
      bedrooms: typeof row.beds === 'number' ? row.beds : null,
      bathrooms: typeof row.baths === 'number' ? row.baths : null,
    }));

    return { ok: true, comps };
  },
};
