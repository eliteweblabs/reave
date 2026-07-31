/** Contractor / trade slugs used for lead targeting and compliance mapping. */
export type TradeSlug = 'plumbing' | 'roofing' | 'remodeling' | 'electrical' | 'hvac' | 'general_contractor' | 'landscaping' | 'tree_service' | 'restoration' | 'insurance' | 'home_inspection' | 'environmental' | 'septic' | 'fire_mitigation';
export type TradeDefinition = {
    slug: TradeSlug;
    label: string;
    /** Compliance rule ids that generate leads for this trade. */
    complianceRuleIds: string[];
    /** Hazard types that boost lead score. */
    hazardBoosts: Array<'flood' | 'wildfire' | 'storm'>;
};
export declare const TRADES: TradeDefinition[];
export declare const TRADE_BY_SLUG: Map<TradeSlug, TradeDefinition>;
export declare function normalizeTradeSlugs(input: string[]): TradeSlug[];
//# sourceMappingURL=trades.d.ts.map