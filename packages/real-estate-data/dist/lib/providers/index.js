import { loadConfig } from '../config.js';
import { assessorsearchProvider } from './assessorsearch.js';
import { attomProvider } from './attom.js';
import { mockProvider } from './mock.js';
import { propdataProvider } from './propdata.js';
const PROVIDERS = {
    mock: mockProvider,
    propdata: propdataProvider,
    assessorsearch: assessorsearchProvider,
    attom: attomProvider,
};
export function getActiveProvider() {
    const id = loadConfig().provider;
    const provider = PROVIDERS[id] ?? mockProvider;
    if (!provider.configured()) {
        // Fall back to mock in dev when keys are missing
        if (mockProvider.configured())
            return mockProvider;
    }
    return provider;
}
export function listProviders() {
    return Object.values(PROVIDERS).map((p) => ({
        id: p.id,
        configured: p.configured(),
    }));
}
export async function lookupProperty(input) {
    return getActiveProvider().lookupProperty(input);
}
export async function lookupComps(input) {
    const provider = getActiveProvider();
    if (!provider.lookupComps) {
        return { ok: false, error: `${provider.id} does not support comparable sales`, code: 'UNSUPPORTED' };
    }
    return provider.lookupComps(input);
}
//# sourceMappingURL=index.js.map