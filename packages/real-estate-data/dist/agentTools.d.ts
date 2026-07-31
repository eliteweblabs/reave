import type { AgentToolModule, HasFeature } from './lib/types.js';
/** Inject from Reave core when bundled; defaults to env-based check for standalone use. */
export type RealEstateDataModuleOptions = {
    hasFeature?: HasFeature;
};
export declare function createRealEstateDataModule(options?: RealEstateDataModuleOptions): AgentToolModule;
/** Default export for Reave manifest registration */
export declare const realEstateDataModule: AgentToolModule;
//# sourceMappingURL=agentTools.d.ts.map