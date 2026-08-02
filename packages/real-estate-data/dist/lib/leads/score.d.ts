import { buildComplianceTimeline } from '../compliance/rules.js';
import type { ComplianceItem } from '../compliance/types.js';
import type { HazardProfile } from '../hazards/profile.js';
import type { PropertyRecord } from '../providers/types.js';
import { type TradeSlug } from '../trades.js';
import type { ServiceAreaConfig } from '../violations/places.js';
import { lookupViolations } from '../violations/index.js';
export type LiabilityRadarReport = {
    property: PropertyRecord;
    compliance: ReturnType<typeof buildComplianceTimeline>;
    hazards: HazardProfile;
    violations: Awaited<ReturnType<typeof lookupViolations>>;
    tradeMatches: Array<{
        trade: TradeSlug;
        reasons: string[];
        score: number;
    }>;
    summary: string;
};
export type LeadScore = {
    score: number;
    reasons: string[];
    matchedTrades: TradeSlug[];
    topComplianceItems: ComplianceItem[];
};
export declare function scoreLeadForTrades(property: Partial<PropertyRecord>, trades: TradeSlug[], opts?: {
    hasSeptic?: boolean;
    isRental?: boolean;
    recentStorm?: boolean;
}): LeadScore;
export declare function buildLiabilityRadarReport(property: PropertyRecord, trades: TradeSlug[], opts?: {
    hasSeptic?: boolean;
    isRental?: boolean;
    serviceArea?: ServiceAreaConfig;
}): Promise<LiabilityRadarReport>;
//# sourceMappingURL=score.d.ts.map