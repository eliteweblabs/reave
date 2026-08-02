import { queryFeed } from './feeds/query.js';
import { resolveFeedCityKey } from './normalize.js';
import {
  isCityInServiceArea,
  resolveServiceAreaMunicipalities,
  type ServiceAreaConfig,
  type ServiceAreaMunicipality,
} from './places.js';
import { getFeedsForCity, listFeedCityKeys } from './registry.js';
import type { CodeViolation, ViolationLookupResult } from './types.js';

export { mockViolationsProvider } from './mock.js';

export type ViolationLookupOptions = {
  /** When set, only municipalities in this service area are queried (from company office). */
  serviceArea?: ServiceAreaConfig;
  socrataAppToken?: string;
};

export type ViolationServiceAreaSummary = {
  center: { lat: number; lng: number };
  radiusMiles: number;
  topPercent: number;
  municipalityCount: number;
  feedCount: number;
  municipalities: ServiceAreaMunicipality[];
};

function loadViolationsProvider(): 'mock' | 'registry' {
  const raw = (typeof process !== 'undefined' ? process.env.VIOLATIONS_PROVIDER : undefined)?.trim().toLowerCase();
  return raw === 'mock' ? 'mock' : 'registry';
}

export function describeViolationServiceArea(config: ServiceAreaConfig): ViolationServiceAreaSummary {
  const feedKeys = new Set(listFeedCityKeys());
  const municipalities = resolveServiceAreaMunicipalities(config, feedKeys);
  return {
    center: { lat: config.centerLat, lng: config.centerLng },
    radiusMiles: config.radiusMiles ?? 30,
    topPercent: config.topPercent ?? 0.5,
    municipalityCount: municipalities.length,
    feedCount: municipalities.filter((m) => m.hasViolationFeed).length,
    municipalities,
  };
}

export async function lookupViolations(
  input: {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  },
  options: ViolationLookupOptions = {},
): Promise<ViolationLookupResult> {
  if (loadViolationsProvider() === 'mock') {
    const { mockViolationsProvider } = await import('./mock.js');
    return mockViolationsProvider.lookup(input);
  }

  const feedCityKey = resolveFeedCityKey(input.city, input.state);
  if (!feedCityKey) {
    return { ok: false, error: 'city and state are required for municipal violation lookup', code: 'INVALID_INPUT' };
  }

  let serviceAreaList: ServiceAreaMunicipality[] | undefined;
  if (options.serviceArea) {
    const feedKeys = new Set(listFeedCityKeys());
    serviceAreaList = resolveServiceAreaMunicipalities(options.serviceArea, feedKeys);
    if (!isCityInServiceArea(input.city, input.state, serviceAreaList)) {
      return {
        ok: true,
        source: 'out_of_service_area',
        violations: [],
        meta: {
          reason: 'Property municipality is outside the company service area (office radius).',
          feedCityKey,
        },
      };
    }
  }

  const feeds = getFeedsForCity(feedCityKey);
  if (!feeds.length) {
    return {
      ok: true,
      source: 'no_feed',
      violations: [],
      meta: {
        reason: 'No public violation feed is configured for this municipality yet.',
        feedCityKey,
        inServiceArea: serviceAreaList ? isCityInServiceArea(input.city, input.state, serviceAreaList) : undefined,
      },
    };
  }

  const violations: CodeViolation[] = [];
  const sources: string[] = [];
  const errors: string[] = [];

  for (const feed of feeds) {
    try {
      const rows = await queryFeed(feed, input, options.socrataAppToken);
      violations.push(...rows);
      sources.push(feed.label);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const deduped = dedupeViolations(violations);
  if (!deduped.length && errors.length) {
    return { ok: false, error: errors.join('; '), code: 'FEED_ERROR' };
  }

  return {
    ok: true,
    source: sources.join(' + ') || feedCityKey,
    violations: deduped,
    meta: {
      feedCityKey,
      queriedFeeds: feeds.length,
      errors: errors.length ? errors : undefined,
    },
  };
}

function dedupeViolations(rows: CodeViolation[]): CodeViolation[] {
  const seen = new Set<string>();
  const out: CodeViolation[] = [];
  for (const row of rows) {
    const key = `${row.id}|${row.description}|${row.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
