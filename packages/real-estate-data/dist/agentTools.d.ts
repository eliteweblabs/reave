import type { AgentToolModule, HasFeature } from './lib/types.js';
import type { ServiceAreaConfig } from './lib/violations/places.js';
/** Inject from Reave core when bundled; defaults to env-based check for standalone use. */
export type RealEstateDataModuleOptions = {
    hasFeature?: HasFeature;
    /** Resolve service area from company office (admin address geo). */
    getViolationServiceArea?: () => Promise<ServiceAreaConfig | null>;
};
export declare function createRealEstateDataModule(options?: RealEstateDataModuleOptions): AgentToolModule;
/** Default export for Reave manifest registration */
export declare const realEstateDataModule: AgentToolModule;
//# sourceMappingURL=agentTools.d.ts.map