const { mockProvider } = require('./mock');
const { homedepotUnwrangleProvider } = require('./homedepot-unwrangle');
const { homedepotBigboxProvider } = require('./homedepot-bigbox');
const { homedepotSerpapiProvider } = require('./homedepot-serpapi');

const ALL_PROVIDERS = [
  homedepotUnwrangleProvider,
  homedepotBigboxProvider,
  homedepotSerpapiProvider,
  mockProvider,
];

const PROVIDER_MAP = Object.fromEntries(ALL_PROVIDERS.map((p) => [p.id, p]));

const RETAILER_ALIASES = {
  homedepot: 'homedepot',
  'home-depot': 'homedepot',
  hd: 'homedepot',
  mock: 'mock',
};

function defaultZip() {
  return process.env.DEFAULT_STORE_ZIP?.trim() || undefined;
}

function homedepotOrder() {
  const raw = process.env.HOMEDEPOT_PROVIDER_ORDER?.trim();
  if (!raw) return ['homedepot-unwrangle', 'homedepot-bigbox', 'homedepot-serpapi', 'mock'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function resolveProviderId(input) {
  const key = String(input || 'homedepot').trim().toLowerCase();
  if (PROVIDER_MAP[key]) return key;
  const retailer = RETAILER_ALIASES[key];
  if (retailer === 'mock') return 'mock';
  if (retailer === 'homedepot') {
    for (const id of homedepotOrder()) {
      const p = PROVIDER_MAP[id];
      if (p?.isConfigured()) return id;
    }
    return 'mock';
  }
  return key;
}

function getProvider(id) {
  const resolved = resolveProviderId(id);
  const provider = PROVIDER_MAP[resolved];
  if (!provider) {
    const err = new Error(`Unknown provider: ${id}`);
    err.status = 400;
    throw err;
  }
  if (!provider.isConfigured()) {
    const err = new Error(`Provider not configured: ${provider.id}`);
    err.status = 503;
    throw err;
  }
  return provider;
}

function listProviders() {
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    retailer: p.id.startsWith('homedepot') ? 'homedepot' : p.id,
  }));
}

function withDefaultZip(opts = {}) {
  return { zip: opts.zip || defaultZip(), ...opts };
}

module.exports = {
  ALL_PROVIDERS,
  getProvider,
  listProviders,
  resolveProviderId,
  withDefaultZip,
};
