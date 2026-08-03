import { loadConfig } from '../config.js';
import type {
  PropertyDataProvider,
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyRecord,
} from './types.js';

const BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';

type AttomProperty = Record<string, unknown>;

function attomKey(): string {
  return loadConfig().attom.apiKey;
}

async function attomGet(path: string, params: Record<string, string>): Promise<Response> {
  const key = attomKey();
  if (!key) throw new Error('ATTOM_API_KEY is not set');
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      apikey: key,
    },
  });
}

function readStr(obj: unknown, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function readNum(obj: unknown, ...keys: string[]): number | null {
  const s = readStr(obj, ...keys);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ownerNameFromProperty(row: AttomProperty): string | null {
  const owner = row.owner as Record<string, unknown> | undefined;
  if (!owner) return null;
  const o1 = owner.owner1 as Record<string, unknown> | undefined;
  if (!o1) return null;
  const last = readStr(o1, 'lastname', 'lastName');
  const first = readStr(o1, 'firstnameandmi', 'firstNameAndMi', 'firstname', 'firstName');
  const joined = [first, last].filter(Boolean).join(' ').trim();
  return joined || last || null;
}

function mapAttomProperty(row: AttomProperty): PropertyRecord & { lat?: number; lng?: number } {
  const identifier = row.identifier as Record<string, unknown> | undefined;
  const address = row.address as Record<string, unknown> | undefined;
  const location = row.location as Record<string, unknown> | undefined;
  const summary = row.summary as Record<string, unknown> | undefined;
  const building = row.building as Record<string, unknown> | undefined;
  const buildingSize = building?.size as Record<string, unknown> | undefined;
  const rooms = building?.rooms as Record<string, unknown> | undefined;
  const assessment = row.assessment as Record<string, unknown> | undefined;
  const assessed = assessment?.assessed as Record<string, unknown> | undefined;
  const market = assessment?.market as Record<string, unknown> | undefined;
  const sale = row.sale as Record<string, unknown> | undefined;
  const amount = sale?.amount as Record<string, unknown> | undefined;

  const attomId = readStr(identifier, 'attomId', 'Id', 'id');
  const line1 = readStr(address, 'line1');
  const locality = readStr(address, 'locality');
  const state = readStr(address, 'countrySubd');
  const zip = readStr(address, 'postal1');
  const oneLine = readStr(address, 'oneLine') || [line1, locality, state, zip].filter(Boolean).join(', ');

  const lat = readNum(location, 'latitude', 'lat');
  const lng = readNum(location, 'longitude', 'lon', 'lng');

  return {
    id: attomId || oneLine || 'unknown',
    fullAddress: oneLine,
    street: line1 || undefined,
    city: locality || undefined,
    state: state || undefined,
    zip: zip || undefined,
    parcelId: readStr(identifier, 'apn') || undefined,
    countyFips: readStr(identifier, 'fips') || undefined,
    yearBuilt: readNum(summary, 'yearbuilt', 'yearBuilt'),
    bedrooms: readNum(rooms, 'beds'),
    bathrooms: readNum(rooms, 'bathstotal', 'bathsTotal'),
    sqft: readNum(buildingSize, 'universalsize', 'universalSize', 'livingsize', 'livingSize'),
    livingAreaSqft: readNum(buildingSize, 'universalsize', 'universalSize', 'livingsize', 'livingSize'),
    propertyType: readStr(summary, 'propclass', 'propClass', 'proptype', 'propType') || null,
    landUseCategory: readStr(summary, 'propLandUse', 'proplanduse') || null,
    ownerName: ownerNameFromProperty(row),
    assessedValue: readNum(assessed, 'assdttlvalue', 'assdTtlValue'),
    marketValue: readNum(market, 'mktttlvalue', 'mktTtlValue') ?? readNum(assessed, 'assdttlvalue', 'assdTtlValue'),
    lastSalePrice: readNum(amount, 'saleamt', 'saleAmt'),
    provider: 'attom',
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    raw: row,
  };
}

function parseAttomResponse(data: Record<string, unknown>): PropertyRecord[] {
  const status = data.status as Record<string, unknown> | undefined;
  const code = status?.code;
  if (code != null && Number(code) !== 0) {
    const msg = readStr(status, 'msg', 'message') || 'ATTOM error';
    throw new Error(msg);
  }
  const rows = data.property;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => mapAttomProperty(row as AttomProperty));
}

export type AttomRadiusSearchInput = {
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  pageSize?: number;
};

export async function attomSearchRadius(input: AttomRadiusSearchInput): Promise<PropertyRecord[]> {
  const radius = Math.min(20, Math.max(0.1, input.radiusMiles));
  const pageSize = String(Math.min(50, Math.max(1, input.pageSize ?? 25)));
  const res = await attomGet('/property/detailowner', {
    latitude: String(input.centerLat),
    longitude: String(input.centerLng),
    radius: String(radius),
    pageSize,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ATTOM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return parseAttomResponse(data);
}

export const attomProvider: PropertyDataProvider = {
  id: 'attom',
  configured: () => !!loadConfig().attom.apiKey,

  async lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const params: Record<string, string> = { pageSize: '5' };
    if (input.parcelId && input.countyFips) {
      params.fips = input.countyFips;
      params.APN = input.parcelId;
    } else {
      const address = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ');
      if (!address.trim()) {
        return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
      }
      params.address = address;
    }

    try {
      const res = await attomGet('/property/detailowner', params);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `ATTOM ${res.status}: ${text.slice(0, 300)}`, code: 'HTTP_ERROR' };
      }
      const data = (await res.json()) as Record<string, unknown>;
      const properties = parseAttomResponse(data);
      if (!properties.length) {
        return { ok: false, error: 'No property matched', code: 'NOT_FOUND' };
      }
      return { ok: true, properties, coverageStatus: 'attom' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'ATTOM request failed', code: 'NETWORK' };
    }
  },
};
