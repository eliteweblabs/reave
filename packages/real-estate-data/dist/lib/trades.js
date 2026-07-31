export const TRADES = [
    {
        slug: 'plumbing',
        label: 'Plumbing',
        complianceRuleIds: ['galvanized_plumbing', 'water_heater', 'septic_pumping', 'cast_iron_drains'],
        hazardBoosts: ['flood', 'storm'],
    },
    {
        slug: 'roofing',
        label: 'Roofing',
        complianceRuleIds: ['roof_replacement'],
        hazardBoosts: ['storm', 'wildfire'],
    },
    {
        slug: 'remodeling',
        label: 'Remodeling',
        complianceRuleIds: ['roof_replacement', 'electrical_panel', 'lead_paint_disclosure'],
        hazardBoosts: [],
    },
    {
        slug: 'electrical',
        label: 'Electrical',
        complianceRuleIds: ['electrical_panel', 'knob_and_tube', 'smoke_co_detectors'],
        hazardBoosts: [],
    },
    {
        slug: 'hvac',
        label: 'HVAC',
        complianceRuleIds: ['hvac_end_of_life'],
        hazardBoosts: [],
    },
    {
        slug: 'general_contractor',
        label: 'General contractor',
        complianceRuleIds: ['roof_replacement', 'electrical_panel', 'galvanized_plumbing', 'hvac_end_of_life'],
        hazardBoosts: ['flood', 'storm', 'wildfire'],
    },
    {
        slug: 'landscaping',
        label: 'Landscaping',
        complianceRuleIds: [],
        hazardBoosts: ['wildfire'],
    },
    {
        slug: 'tree_service',
        label: 'Tree service',
        complianceRuleIds: [],
        hazardBoosts: ['storm'],
    },
    {
        slug: 'restoration',
        label: 'Restoration (water/fire)',
        complianceRuleIds: [],
        hazardBoosts: ['flood', 'wildfire', 'storm'],
    },
    {
        slug: 'insurance',
        label: 'Insurance',
        complianceRuleIds: [],
        hazardBoosts: ['flood', 'wildfire'],
    },
    {
        slug: 'home_inspection',
        label: 'Home inspection',
        complianceRuleIds: ['roof_replacement', 'electrical_panel', 'galvanized_plumbing', 'hvac_end_of_life', 'lead_paint_disclosure'],
        hazardBoosts: [],
    },
    {
        slug: 'environmental',
        label: 'Environmental (lead/asbestos)',
        complianceRuleIds: ['lead_paint_disclosure', 'asbestos_materials'],
        hazardBoosts: [],
    },
    {
        slug: 'septic',
        label: 'Septic',
        complianceRuleIds: ['septic_pumping'],
        hazardBoosts: [],
    },
    {
        slug: 'fire_mitigation',
        label: 'Fire mitigation',
        complianceRuleIds: [],
        hazardBoosts: ['wildfire'],
    },
];
export const TRADE_BY_SLUG = new Map(TRADES.map((t) => [t.slug, t]));
export function normalizeTradeSlugs(input) {
    const out = [];
    for (const raw of input) {
        const slug = raw.trim().toLowerCase().replace(/\s+/g, '_');
        if (TRADE_BY_SLUG.has(slug))
            out.push(slug);
    }
    return [...new Set(out)];
}
//# sourceMappingURL=trades.js.map