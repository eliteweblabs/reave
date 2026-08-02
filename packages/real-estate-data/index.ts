export { realEstateDataPlugin, default } from './manifest.js';
export { createRealEstateDataModule, realEstateDataModule } from './agentTools.js';
export {
  lookupProperty,
  lookupComps,
  getFloorArea,
  getActiveProvider,
  listProviders,
  isRealEstateDataConfigured,
  loadConfig,
} from './lib/propertyService.js';
export { buildComplianceTimeline, COMPLIANCE_RULES } from './lib/compliance/index.js';
export { buildHazardProfile } from './lib/hazards/index.js';
export { buildLiabilityRadarReport, scoreLeadForTrades } from './lib/leads/score.js';
export { runRadiusScan } from './lib/scanner/engine.js';
export { TRADES, normalizeTradeSlugs } from './lib/trades.js';
export { distanceMiles, isWithinRadiusMiles } from './lib/geo/index.js';
export { lookupViolations } from './lib/violations/index.js';
export type { PropertyRecord } from './lib/providers/types.js';
export type { TradeSlug } from './lib/trades.js';
export type { ScanCandidate, ScanResult, ScanCenterLocation } from './lib/scanner/engine.js';
