const DEFAULT_DISCLAIMER = 'Informational only — not legal advice. Requirements vary by municipality; verify with local code enforcement and licensed professionals.';
export const COMPLIANCE_RULES = [
    {
        id: 'roof_replacement',
        title: 'Roof replacement typical lifespan',
        typicalIntervalYears: 25,
        minAgeYears: 25,
        lawOrStandard: 'Industry typical lifespan (asphalt shingle 20–30 years)',
        contractorTypes: ['roofing', 'general_contractor', 'remodeling'],
        urgency: 'medium',
        note: 'Assessor records rarely include roof install date — age of home is a proxy.',
    },
    {
        id: 'electrical_panel',
        title: 'Electrical panel upgrade evaluation',
        builtBeforeYear: 1970,
        lawOrStandard: 'NEC / insurance underwriting for pre-1970 panels (Federal Pacific, Zinsco, etc.)',
        contractorTypes: ['electrical', 'general_contractor'],
        urgency: 'high',
    },
    {
        id: 'knob_and_tube',
        title: 'Knob-and-tube or ungrounded wiring review',
        builtBeforeYear: 1950,
        lawOrStandard: 'Modern NEC grounding requirements; insurability concerns',
        contractorTypes: ['electrical'],
        urgency: 'high',
    },
    {
        id: 'galvanized_plumbing',
        title: 'Galvanized supply pipe replacement window',
        typicalIntervalYears: 50,
        minAgeYears: 50,
        lawOrStandard: 'Typical failure window for galvanized steel supply lines',
        contractorTypes: ['plumbing', 'general_contractor'],
        urgency: 'high',
    },
    {
        id: 'cast_iron_drains',
        title: 'Cast iron drain line inspection',
        typicalIntervalYears: 50,
        minAgeYears: 50,
        lawOrStandard: 'Typical cast iron DWV failure window',
        contractorTypes: ['plumbing'],
        urgency: 'medium',
    },
    {
        id: 'hvac_end_of_life',
        title: 'HVAC system replacement window',
        typicalIntervalYears: 20,
        minAgeYears: 20,
        lawOrStandard: 'Industry typical lifespan (furnace/central AC 15–25 years)',
        contractorTypes: ['hvac', 'general_contractor'],
        urgency: 'medium',
    },
    {
        id: 'water_heater',
        title: 'Water heater replacement window',
        typicalIntervalYears: 12,
        minAgeYears: 12,
        lawOrStandard: 'Industry typical lifespan (tank 8–12 years)',
        contractorTypes: ['plumbing', 'hvac'],
        urgency: 'medium',
    },
    {
        id: 'lead_paint_disclosure',
        title: 'Lead paint disclosure (pre-1978)',
        builtBeforeYear: 1978,
        lawOrStandard: 'Federal lead-based paint disclosure (42 U.S.C. §4852d); MA deleading for rentals',
        contractorTypes: ['environmental', 'remodeling', 'home_inspection'],
        urgency: 'high',
        note: 'Rental and sale transactions have additional requirements in many states.',
    },
    {
        id: 'asbestos_materials',
        title: 'Asbestos-containing materials review',
        builtBeforeYear: 1980,
        lawOrStandard: 'EPA/NESHAP — disturbance during renovation',
        contractorTypes: ['environmental', 'remodeling'],
        urgency: 'medium',
    },
    {
        id: 'septic_pumping',
        title: 'Septic tank pumping interval',
        typicalIntervalYears: 3,
        requiresSeptic: true,
        lawOrStandard: 'State/county health codes (typically every 3–5 years)',
        contractorTypes: ['septic', 'plumbing'],
        urgency: 'medium',
        note: 'Applies when property is on septic, not municipal sewer.',
    },
    {
        id: 'smoke_co_detectors',
        title: 'Smoke & CO detector compliance',
        states: ['MA', 'CA', 'NY', 'CT', 'RI'],
        lawOrStandard: 'State fire code — transfer, rental, and retrofit requirements vary',
        contractorTypes: ['electrical', 'home_inspection'],
        urgency: 'medium',
        note: 'MA requires compliance on sale/transfer; other states vary.',
    },
];
const RULE_BY_ID = new Map(COMPLIANCE_RULES.map((r) => [r.id, r]));
export function getComplianceRule(id) {
    return RULE_BY_ID.get(id);
}
function normalizeState(state) {
    return (state ?? 'DEFAULT').trim().toUpperCase().slice(0, 2) || 'DEFAULT';
}
function ruleAppliesToState(rule, state) {
    if (!rule.states?.length)
        return true;
    return rule.states.includes(state);
}
function evaluateRule(rule, input, age) {
    const state = normalizeState(input.state);
    if (!ruleAppliesToState(rule, state))
        return null;
    if (rule.requiresSeptic && !input.hasSeptic)
        return null;
    if (rule.requiresRental && !input.isRental)
        return null;
    if (input.yearBuilt != null && rule.builtBeforeYear != null && input.yearBuilt >= rule.builtBeforeYear) {
        return null;
    }
    if (age == null) {
        return {
            id: rule.id,
            title: rule.title,
            status: 'informational',
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note ?? 'Year built unknown — cannot assess age-based timeline.',
        };
    }
    if (rule.minAgeYears != null && age >= rule.minAgeYears + 5) {
        return {
            id: rule.id,
            title: rule.title,
            status: 'overdue',
            yearsPastDue: age - rule.minAgeYears,
            typicalIntervalYears: rule.typicalIntervalYears ?? rule.minAgeYears,
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note,
        };
    }
    if (rule.minAgeYears != null && age >= rule.minAgeYears) {
        return {
            id: rule.id,
            title: rule.title,
            status: 'due_soon',
            typicalIntervalYears: rule.typicalIntervalYears ?? rule.minAgeYears,
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note,
        };
    }
    if (rule.builtBeforeYear != null && input.yearBuilt != null && input.yearBuilt < rule.builtBeforeYear) {
        return {
            id: rule.id,
            title: rule.title,
            status: 'overdue',
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note,
        };
    }
    if (rule.requiresSeptic && input.hasSeptic) {
        return {
            id: rule.id,
            title: rule.title,
            status: 'due_soon',
            typicalIntervalYears: rule.typicalIntervalYears,
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note,
        };
    }
    if (rule.states?.length && rule.id === 'smoke_co_detectors') {
        return {
            id: rule.id,
            title: rule.title,
            status: 'informational',
            lawOrStandard: rule.lawOrStandard,
            contractorTypes: rule.contractorTypes,
            urgency: rule.urgency,
            note: rule.note,
        };
    }
    return null;
}
export function buildComplianceTimeline(input) {
    const currentYear = input.currentYear ?? new Date().getFullYear();
    const yearBuilt = input.yearBuilt ?? null;
    const propertyAgeYears = yearBuilt != null ? currentYear - yearBuilt : null;
    const state = normalizeState(input.state);
    const overdue = [];
    const dueSoon = [];
    const upcoming = [];
    const informational = [];
    for (const rule of COMPLIANCE_RULES) {
        const item = evaluateRule(rule, input, propertyAgeYears);
        if (!item)
            continue;
        switch (item.status) {
            case 'overdue':
                overdue.push(item);
                break;
            case 'due_soon':
                dueSoon.push(item);
                break;
            case 'upcoming':
                upcoming.push(item);
                break;
            default:
                informational.push(item);
        }
    }
    const urgencyRank = { high: 0, medium: 1, low: 2 };
    const sort = (a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency];
    return {
        state,
        yearBuilt,
        propertyAgeYears,
        overdue: overdue.sort(sort),
        dueSoon: dueSoon.sort(sort),
        upcoming: upcoming.sort(sort),
        informational: informational.sort(sort),
        disclaimer: DEFAULT_DISCLAIMER,
    };
}
//# sourceMappingURL=rules.js.map