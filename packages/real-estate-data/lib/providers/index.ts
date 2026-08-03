import { loadConfig } from '../config.js';
import { assessorsearchProvider } from './assessorsearch.js';
import { attomProvider } from './attom.js';
import { mockProvider } from './mock.js';
import { propdataProvider } from './propdata.js';
import type {
  CompsLookupInput,
  CompsLookupResult,
  PropertyDataProvider,
  PropertyLookupInput,
  PropertyLookupResult,
  ProviderId,
} from './types.js';

const PROVIDERS: Record<ProviderId, PropertyDataProvider> = {
  mock: mockProvider,
  propdata: propdataProvider,
  assessorsearch: assessorsearchProvider,
  attom: attomProvider,
};

export function getActiveProvider(): PropertyDataProvider {
  const id = loadConfig().provider;
  const provider = PROVIDERS[id] ?? mockProvider;
  if (!provider.configured()) {
    // Fall back to mock in dev when keys are missing
    if (mockProvider.configured()) return mockProvider;
  }
  return provider;
}

export function listProviders(): Array<{ id: ProviderId; configured: boolean }> {
  return (Object.values(PROVIDERS) as PropertyDataProvider[]).map((p) => ({
    id: p.id,
    configured: p.configured(),
  }));
}

export async function lookupProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
  return getActiveProvider().lookupProperty(input);
}

export async function lookupComps(input: CompsLookupInput): Promise<CompsLookupResult> {
  const provider = getActiveProvider();
  if (!provider.lookupComps) {
    return { ok: false, error: `${provider.id} does not support comparable sales`, code: 'UNSUPPORTED' };
  }
  return provider.lookupComps(input);
}

export type { PropertyRecord, PropertyLookupInput, CompsLookupInput } from './types.js';
