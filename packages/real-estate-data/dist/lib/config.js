function env(key) {
    return (typeof process !== 'undefined' ? process.env[key] : undefined)?.trim() ?? '';
}
export function loadConfig() {
    const providerRaw = env('REAL_ESTATE_DATA_PROVIDER') || 'mock';
    const provider = providerRaw;
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
    };
}
export function isRealEstateDataConfigured() {
    const cfg = loadConfig();
    switch (cfg.provider) {
        case 'mock':
            return true;
        case 'propdata':
            return !!cfg.propdata.apiKey;
        case 'assessorsearch':
            return !!cfg.assessorsearch.apiKey;
        default:
            return false;
    }
}
//# sourceMappingURL=config.js.map