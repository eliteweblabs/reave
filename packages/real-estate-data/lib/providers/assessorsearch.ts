/**
 * AssessorSearch adapter — stub for Phase 2.
 * Docs: https://assessorsearch.com/property-data-api
 *
 * GET /v1/properties?address=... — 1 credit per matched core record
 * Returns year_built, sqft, living_area_sqft, lot_size, zoning, owner, tax, etc.
 */
import { loadConfig } from '../config.js';
import type { PropertyDataProvider, PropertyLookupInput, PropertyLookupResult } from './types.js';

export const assessorsearchProvider: PropertyDataProvider = {
  id: 'assessorsearch',
  configured: () => !!loadConfig().assessorsearch.apiKey,

  async lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const cfg = loadConfig().assessorsearch;
    const address = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ');
    if (!address.trim() && !input.parcelId) {
      return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
    }

    const url = new URL('/v1/properties', cfg.baseUrl.replace(/\/$/, '') + '/');
    if (input.parcelId) url.searchParams.set('apn', input.parcelId);
    else url.searchParams.set('address', address);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: 'application/json',
        },
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'AssessorSearch request failed',
        code: 'NETWORK',
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `AssessorSearch ${res.status}: ${text.slice(0, 300)}`,
        code: 'HTTP_ERROR',
      };
    }

    // Response shape TBD — map once we have a live key to validate against.
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: false,
      error:
        'AssessorSearch response mapping not yet implemented — use propdata or mock. Raw response attached in error for debugging.',
      code: 'NOT_IMPLEMENTED',
    };
  },
};
