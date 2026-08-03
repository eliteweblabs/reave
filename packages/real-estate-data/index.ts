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
export { runRadiusScan, runRadiusScanSync } from './lib/scanner/engine.js';
export { TRADES, normalizeTradeSlugs } from './lib/trades.js';
export { distanceMiles, isWithinRadiusMiles } from './lib/geo/index.js';
export {
  lookupViolations,
  describeViolationServiceArea,
  type ViolationLookupOptions,
  type ViolationServiceAreaSummary,
} from './lib/violations/index.js';
export type { ServiceAreaConfig, ServiceAreaMunicipality } from './lib/violations/places.js';
export type { PropertyRecord } from './lib/providers/types.js';
export type { TradeSlug } from './lib/trades.js';
export type { ScanCandidate, ScanResult, ScanCenterLocation } from './lib/scanner/engine.js';
