import type { ProviderId } from './providers/types.js';
export type RealEstateDataConfig = {
    provider: ProviderId;
    propdata: {
        apiKey: string;
        baseUrl: string;
    };
    assessorsearch: {
        apiKey: string;
        baseUrl: string;
    };
};
export declare function loadConfig(): RealEstateDataConfig;
export declare function isRealEstateDataConfigured(): boolean;
//# sourceMappingURL=config.d.ts.map