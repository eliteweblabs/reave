import { distanceMiles, isWithinRadiusMiles } from '../geo/haversine.js';
import { scoreLeadForTrades } from '../leads/score.js';
import { loadConfig } from '../config.js';
import { attomSearchRadius } from '../providers/attom.js';
import type { PropertyRecord } from '../providers/types.js';
import { normalizeTradeSlugs, type TradeSlug } from '../trades.js';

export type ScanCandidate = PropertyRecord & {
  lat: number;
  lng: number;
  distanceMiles: number;
  leadScore: number;
  leadReasons: string[];
  matchedTrades: TradeSlug[];
};

export type ScanCenterLocation = {
  city: string;
  state: string;
  zip?: string;
};

export type ScanConfig = {
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  trades: TradeSlug[];
  maxResults?: number;
  /** City/state/zip for mock scan addresses — should match the scan center, not a demo locale. */
  centerLocation?: ScanCenterLocation;
};

export type ScanResult = {
  ok: true;
  scannedAt: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  trades: TradeSlug[];
  candidatesFound: number;
  candidates: ScanCandidate[];
  provider?: string;
  error?: string;
};

/** Deterministic mock candidates around a center for dev/demo scans. */
function mockCandidatesNear(
  centerLat: number,
  centerLng: number,
  location?: ScanCenterLocation,
): Array<PropertyRecord & { lat: number; lng: number }> {
  const city = location?.city?.trim() || 'Local Area';
  const state = location?.state?.trim().toUpperCase() || 'US';
  const zip = location?.zip?.trim() || '00000';

  const offsets = [
    { dLat: 0.01, dLng: 0.008, address: '45 Oak Avenue', yearBuilt: 1962, owner: 'SMITH JOHN & MARY' },
    { dLat: -0.012, dLng: 0.005, address: '88 Pine Road', yearBuilt: 1938, owner: 'PINE HOLDINGS LLC' },
    { dLat: 0.006, dLng: -0.015, address: '210 Elm Street', yearBuilt: 2004, owner: 'ELM FAMILY TRUST' },
    { dLat: -0.008, dLng: -0.01, address: '123 Main Street', yearBuilt: 1924, owner: 'EXAMPLE HOLDINGS LLC' },
    { dLat: 0.018, dLng: 0.002, address: '5 River Lane', yearBuilt: 1971, owner: 'RIVER VIEW PROPERTIES' },
  ];

  const specs = [
    { marketValue: 485000, assessedValue: 412000, bedrooms: 3, bathrooms: 2, lastSalePrice: 318000, propertyType: 'Single family' },
    { marketValue: 625000, assessedValue: 540000, bedrooms: 4, bathrooms: 2.5, lastSalePrice: 89000, propertyType: 'Multi-family' },
    { marketValue: 720000, assessedValue: 655000, bedrooms: 4, bathrooms: 3, lastSalePrice: 510000, propertyType: 'Single family' },
    { marketValue: 395000, assessedValue: 348000, bedrooms: 3, bathrooms: 1.5, lastSalePrice: 145000, propertyType: 'Single family' },
    { marketValue: 540000, assessedValue: 478000, bedrooms: 3, bathrooms: 2, lastSalePrice: 275000, propertyType: 'Waterfront' },
  ];

  return offsets.map((o, i) => ({
    id: `mock-scan-${Math.round(centerLat * 1000)}-${Math.round(centerLng * 1000)}-${i}`,
    fullAddress: zip ? `${o.address}, ${city}, ${state} ${zip}` : `${o.address}, ${city}, ${state}`,
    street: o.address,
    city,
    state,
    zip,
    yearBuilt: o.yearBuilt,
    sqft: 1800 + i * 400,
    livingAreaSqft: 1800 + i * 400,
    bedrooms: specs[i].bedrooms,
    bathrooms: specs[i].bathrooms,
    marketValue: specs[i].marketValue,
    assessedValue: specs[i].assessedValue,
    lastSalePrice: specs[i].lastSalePrice,
    propertyType: specs[i].propertyType,
    landUseCategory: specs[i].propertyType,
    stories: o.yearBuilt < 1960 ? 2 : 1,
    ownerName: o.owner,
    floodZone: i === 4 ? 'AE' : 'X',
    provider: 'mock' as const,
    lat: centerLat + o.dLat,
    lng: centerLng + o.dLng,
  }));
}

function scoreCandidates(
  config: ScanConfig,
  raw: Array<PropertyRecord & { lat?: number; lng?: number }>,
  provider: string,
): ScanResult {
  const trades = normalizeTradeSlugs(config.trades);
  const max = config.maxResults ?? 25;
  const candidates: ScanCandidate[] = [];

  for (const row of raw) {
    const lat = row.lat;
    const lng = row.lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const dist = distanceMiles(config.centerLat, config.centerLng, lat, lng);
    if (!isWithinRadiusMiles(config.centerLat, config.centerLng, lat, lng, config.radiusMiles)) {
      continue;
    }

    const lead = scoreLeadForTrades(row, trades, {
      hasSeptic: row.landUseCategory?.toLowerCase().includes('rural'),
      recentStorm: false,
    });

    if (lead.score <= 0 && trades.length > 0) continue;

    candidates.push({
      ...row,
      lat,
      lng,
      distanceMiles: Math.round(dist * 10) / 10,
      leadScore: lead.score,
      leadReasons: lead.reasons,
      matchedTrades: lead.matchedTrades,
    });
  }

  candidates.sort((a, b) => b.leadScore - a.leadScore || a.distanceMiles - b.distanceMiles);

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    center: { lat: config.centerLat, lng: config.centerLng },
    radiusMiles: config.radiusMiles,
    trades,
    candidatesFound: candidates.length,
    candidates: candidates.slice(0, max),
    provider,
  };
}

function runMockRadiusScan(config: ScanConfig): ScanResult {
  const raw = mockCandidatesNear(config.centerLat, config.centerLng, config.centerLocation);
  return scoreCandidates(config, raw, 'mock');
}

async function runAttomRadiusScan(config: ScanConfig): Promise<ScanResult> {
  try {
    const rows = await attomSearchRadius({
      centerLat: config.centerLat,
      centerLng: config.centerLng,
      radiusMiles: config.radiusMiles,
      pageSize: config.maxResults ?? 25,
    });
    return scoreCandidates(config, rows, 'attom');
  } catch (e) {
    const trades = normalizeTradeSlugs(config.trades);
    return {
      ok: true,
      scannedAt: new Date().toISOString(),
      center: { lat: config.centerLat, lng: config.centerLng },
      radiusMiles: config.radiusMiles,
      trades,
      candidatesFound: 0,
      candidates: [],
      provider: 'attom',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Radius lead scan — uses ATTOM when configured, otherwise mock demo data. */
export async function runRadiusScan(config: ScanConfig): Promise<ScanResult> {
  const provider = loadConfig().provider;
  if (provider === 'attom' && loadConfig().attom.apiKey) {
    return runAttomRadiusScan(config);
  }
  return runMockRadiusScan(config);
}

/** @deprecated Sync mock-only scan — prefer async runRadiusScan. */
export function runRadiusScanSync(config: ScanConfig): ScanResult {
  return runMockRadiusScan(config);
}
