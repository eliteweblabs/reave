import type { ProviderId } from './providers/types.js';

export type RealEstateDataConfig = {
  provider: ProviderId;
  propdata: { apiKey: string; baseUrl: string };
  assessorsearch: { apiKey: string; baseUrl: string };
  attom: { apiKey: string };
};

function env(key: string): string {
  return (typeof process !== 'undefined' ? process.env[key] : undefined)?.trim() ?? '';
}

export function loadConfig(): RealEstateDataConfig {
  const providerRaw = env('REAL_ESTATE_DATA_PROVIDER') || 'mock';
  const provider = providerRaw as ProviderId;

  return {
    provider,
    propdata: {
      apiKey: env('PROPDATA_API_KEY'),
      baseUrl: env('PROPDATA_BASE_URL') || 'https://propdata-api-worker.sales-fd3.workers.dev',
    },
    assessorsearch: {
      apiKey: env('ASSESSORSEARCH_API_KEY'),
      baseUrl: env('ASSESSORSEARCH_BASE_URL') || 'https://api.assessorsearch.com',
    },
    attom: {
      apiKey: env('ATTOM_API_KEY'),
    },
  };
}

export function isRealEstateDataConfigured(): boolean {
  const cfg = loadConfig();
  switch (cfg.provider) {
    case 'mock':
      return true;
    case 'propdata':
      return !!cfg.propdata.apiKey;
    case 'assessorsearch':
      return !!cfg.assessorsearch.apiKey;
    case 'attom':
      return !!cfg.attom.apiKey;
    default:
      return false;
  }
}
