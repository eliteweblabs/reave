export type ComplianceStatus = 'overdue' | 'due_soon' | 'upcoming' | 'informational';
export type ComplianceItem = {
    id: string;
    title: string;
    status: ComplianceStatus;
    /** Years past typical replacement / inspection interval when overdue. */
    yearsPastDue?: number;
    typicalIntervalYears?: number;
    lawOrStandard?: string;
    contractorTypes: string[];
    urgency: 'high' | 'medium' | 'low';
    note?: string;
};
export type ComplianceRule = {
    id: string;
    title: string;
    typicalIntervalYears?: number;
    /** Property must be built before this year to trigger (exclusive). */
    builtBeforeYear?: number;
    /** Property must be at least this many years old. */
    minAgeYears?: number;
    /** State codes where rule applies; empty = all states. */
    states?: string[];
    /** Requires property flag. */
    requiresSeptic?: boolean;
    requiresRental?: boolean;
    lawOrStandard: string;
    contractorTypes: string[];
    urgency: 'high' | 'medium' | 'low';
    note?: string;
};
export type ComplianceInput = {
    yearBuilt?: number | null;
    state?: string | null;
    propertyType?: string | null;
    hasSeptic?: boolean;
    isRental?: boolean;
    currentYear?: number;
};
export type ComplianceTimeline = {
    state: string;
    yearBuilt: number | null;
    propertyAgeYears: number | null;
    overdue: ComplianceItem[];
    dueSoon: ComplianceItem[];
    upcoming: ComplianceItem[];
    informational: ComplianceItem[];
    disclaimer: string;
};
//# sourceMappingURL=types.d.ts.map