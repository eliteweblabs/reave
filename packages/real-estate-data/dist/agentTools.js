import { buildComplianceTimeline } from './lib/compliance/index.js';
import { isRealEstateDataConfigured, loadConfig } from './lib/config.js';
import { buildHazardProfile } from './lib/hazards/index.js';
import { buildLiabilityRadarReport } from './lib/leads/score.js';
import { getFloorArea, lookupComps, lookupProperty } from './lib/propertyService.js';
import { getActiveProvider, listProviders } from './lib/providers/index.js';
import { runRadiusScan } from './lib/scanner/engine.js';
import { normalizeTradeSlugs, TRADES } from './lib/trades.js';
import { DEFAULT_FEATURE_ID } from './lib/types.js';
import { lookupViolations } from './lib/violations/index.js';
function createHasFeature(opt) {
    return (opt?.hasFeature ??
        ((id) => {
            if (id !== DEFAULT_FEATURE_ID)
                return false;
            const fromEnv = process.env.REAL_ESTATE_DATA_ENABLED;
            if (fromEnv === '1' || fromEnv === 'true')
                return true;
            return isRealEstateDataConfigured();
        }));
}
async function handle_lookup_property(args, _ctx) {
    const result = await lookupProperty({
        address: args.address != null ? String(args.address) : undefined,
        city: args.city != null ? String(args.city) : undefined,
        state: args.state != null ? String(args.state) : undefined,
        zip: args.zip != null ? String(args.zip) : undefined,
        parcelId: args.parcel_id != null ? String(args.parcel_id) : args.parcelId != null ? String(args.parcelId) : undefined,
        countyFips: args.county_fips != null ? String(args.county_fips) : args.countyFips != null ? String(args.countyFips) : undefined,
    });
    if (!result.ok)
        return JSON.stringify({ error: result.error, code: result.code });
    const provider = getActiveProvider().id;
    return JSON.stringify({
        ok: true,
        provider,
        coverageStatus: result.coverageStatus,
        count: result.properties.length,
        properties: result.properties,
    });
}
async function handle_get_property_floor_area(args, _ctx) {
    const result = await getFloorArea({
        address: args.address != null ? String(args.address) : undefined,
        city: args.city != null ? String(args.city) : undefined,
        state: args.state != null ? String(args.state) : undefined,
        zip: args.zip != null ? String(args.zip) : undefined,
        floor: args.floor != null ? (typeof args.floor === 'number' ? args.floor : Number(args.floor) || String(args.floor)) : undefined,
        floorLabel: args.floor_label != null ? String(args.floor_label) : args.floorLabel != null ? String(args.floorLabel) : undefined,
    });
    if (!result.ok)
        return JSON.stringify({ error: result.error, code: result.code });
    return JSON.stringify({
        ok: true,
        floor: result.floor,
        sqft: result.sqft,
        source: result.source,
        note: result.note,
        address: result.property.fullAddress,
        yearBuilt: result.property.yearBuilt,
        stories: result.property.stories,
        totalBuildingSqft: result.property.livingAreaSqft ?? result.property.sqft,
    });
}
async function handle_get_property_year_built(args, _ctx) {
    const result = await lookupProperty({
        address: args.address != null ? String(args.address) : undefined,
        city: args.city != null ? String(args.city) : undefined,
        state: args.state != null ? String(args.state) : undefined,
        zip: args.zip != null ? String(args.zip) : undefined,
    });
    if (!result.ok)
        return JSON.stringify({ error: result.error, code: result.code });
    const property = result.properties[0];
    if (!property)
        return JSON.stringify({ error: 'No property matched that address', code: 'NOT_FOUND' });
    return JSON.stringify({
        ok: true,
        address: property.fullAddress,
        yearBuilt: property.yearBuilt,
        yearBuiltEffective: property.yearBuiltEffective,
        provider: property.provider,
        note: property.yearBuilt == null ? 'Year built not available from current data source' : undefined,
    });
}
async function handle_search_property_comps(args, _ctx) {
    const result = await lookupComps({
        address: args.address != null ? String(args.address) : undefined,
        parcelId: args.parcel_id != null ? String(args.parcel_id) : undefined,
        countyFips: args.county_fips != null ? String(args.county_fips) : undefined,
        bedrooms: args.bedrooms != null ? Number(args.bedrooms) : undefined,
        limit: args.limit != null ? Number(args.limit) : undefined,
    });
    if (!result.ok)
        return JSON.stringify({ error: result.error, code: result.code });
    return JSON.stringify({ ok: true, count: result.comps.length, comps: result.comps });
}
function addressArgs(args) {
    return {
        address: args.address != null ? String(args.address) : undefined,
        city: args.city != null ? String(args.city) : undefined,
        state: args.state != null ? String(args.state) : undefined,
        zip: args.zip != null ? String(args.zip) : undefined,
    };
}
async function handle_get_property_compliance_timeline(args, _ctx) {
    const lookup = await lookupProperty(addressArgs(args));
    const property = lookup.ok ? lookup.properties[0] : undefined;
    const timeline = buildComplianceTimeline({
        yearBuilt: property?.yearBuilt ?? (args.year_built != null ? Number(args.year_built) : null),
        state: property?.state ?? (args.state != null ? String(args.state) : null),
        hasSeptic: args.has_septic === true,
        isRental: args.is_rental === true,
    });
    return JSON.stringify({ ok: true, address: property?.fullAddress, timeline });
}
async function handle_get_property_hazard_profile(args, _ctx) {
    const lookup = await lookupProperty(addressArgs(args));
    if (!lookup.ok)
        return JSON.stringify({ error: lookup.error, code: lookup.code });
    const property = lookup.properties[0];
    if (!property)
        return JSON.stringify({ error: 'No property matched', code: 'NOT_FOUND' });
    const hazards = buildHazardProfile(property);
    return JSON.stringify({ ok: true, address: property.fullAddress, hazards });
}
async function handle_lookup_code_violations(args, _ctx) {
    const addr = addressArgs(args);
    if (!addr.address?.trim())
        return JSON.stringify({ error: 'address is required', code: 'INVALID_INPUT' });
    const result = await lookupViolations({ ...addr, address: addr.address });
    return JSON.stringify(result);
}
async function handle_assess_property_liability(args, _ctx) {
    const lookup = await lookupProperty(addressArgs(args));
    if (!lookup.ok)
        return JSON.stringify({ error: lookup.error, code: lookup.code });
    const property = lookup.properties[0];
    if (!property)
        return JSON.stringify({ error: 'No property matched', code: 'NOT_FOUND' });
    const trades = normalizeTradeSlugs(Array.isArray(args.trades) ? args.trades.map(String) : args.trade ? [String(args.trade)] : ['general_contractor']);
    const report = await buildLiabilityRadarReport(property, trades, {
        hasSeptic: args.has_septic === true,
        isRental: args.is_rental === true,
    });
    return JSON.stringify({ ok: true, report });
}
async function handle_run_lead_scan(args, _ctx) {
    const centerLat = Number(args.center_lat ?? args.centerLat);
    const centerLng = Number(args.center_lng ?? args.centerLng);
    const radiusMiles = Number(args.radius_miles ?? args.radiusMiles ?? 15);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
        return JSON.stringify({ error: 'center_lat and center_lng are required', code: 'INVALID_INPUT' });
    }
    const trades = normalizeTradeSlugs(Array.isArray(args.trades) ? args.trades.map(String) : ['plumbing', 'roofing', 'general_contractor']);
    const result = runRadiusScan({
        centerLat,
        centerLng,
        radiusMiles,
        trades,
        maxResults: args.limit != null ? Number(args.limit) : 25,
    });
    return JSON.stringify(result);
}
async function handle_real_estate_data_status(_args, _ctx) {
    const cfg = loadConfig();
    return JSON.stringify({
        ok: true,
        feature: DEFAULT_FEATURE_ID,
        activeProvider: getActiveProvider().id,
        configured: isRealEstateDataConfigured(),
        providers: listProviders(),
        env: {
            REAL_ESTATE_DATA_PROVIDER: cfg.provider,
            hasPropdataKey: !!cfg.propdata.apiKey,
            hasAssessorsearchKey: !!cfg.assessorsearch.apiKey,
        },
    });
}
export function createRealEstateDataModule(options) {
    const hasFeature = createHasFeature(options);
    return {
        id: 'real-estate-data',
        enabled: () => hasFeature(DEFAULT_FEATURE_ID) && isRealEstateDataConfigured(),
        definitions(_ctx) {
            return [
                {
                    type: 'function',
                    function: {
                        name: 'lookup_property',
                        description: 'Look up U.S. property records by street address or parcel/APN. Returns year built, square footage, beds/baths, lot size, zoning, owner, tax/assessed values, last sale, flood zone, and parcel id. Use for contractors, developers, agents, attorneys, electricians, plumbers, and inspectors asking factual questions about a specific property.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string', description: 'Street address, e.g. "123 Main Street"' },
                                city: { type: 'string' },
                                state: { type: 'string', description: '2-letter state code' },
                                zip: { type: 'string', description: '5-digit ZIP' },
                                parcel_id: { type: 'string', description: 'Parcel / APN when known instead of address' },
                                county_fips: { type: 'string', description: '5-digit county FIPS when using parcel_id' },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'get_property_floor_area',
                        description: 'Get square footage for a specific floor of a property (e.g. "2nd floor"). Most county assessor sources only provide total building sqft — when per-floor data is missing, returns an estimate split evenly across stories with a clear note. Prefer this over guessing from total sqft.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                                floor: { type: 'number', description: 'Floor number (1, 2, 3) or label like basement' },
                                floor_label: {
                                    type: 'string',
                                    description: 'Natural language floor, e.g. "second floor", "2nd floor", "basement"',
                                },
                            },
                            required: ['address'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'get_property_year_built',
                        description: 'When a user asks when a property was built or its construction year. Returns year built from county assessor / parcel records when available.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                            },
                            required: ['address'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'search_property_comps',
                        description: 'Find comparable recent sales near a property — useful for agents, developers, and attorneys evaluating market context.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                parcel_id: { type: 'string' },
                                county_fips: { type: 'string' },
                                bedrooms: { type: 'number', description: 'Filter comps by bedroom count' },
                                limit: { type: 'number', description: 'Max comps to return (default 10)' },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'get_property_compliance_timeline',
                        description: 'Chronological compliance and lifecycle items for a property — what may be overdue based on year built and state (roof, electrical panel, plumbing, HVAC, lead paint, septic, smoke/CO). Informational, not legal advice.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                                year_built: { type: 'number', description: 'Override when address lookup unavailable' },
                                has_septic: { type: 'boolean' },
                                is_rental: { type: 'boolean' },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'get_property_hazard_profile',
                        description: 'Flood zone, wildfire context, and hazard notes for fire/water/storm lead qualification.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                            },
                            required: ['address'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'lookup_code_violations',
                        description: 'Open municipal code violations on file for an address when city data is available.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                            },
                            required: ['address'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'assess_property_liability',
                        description: 'Full Property Liability Radar — compliance timeline, hazards, violations, and trade-specific lead score. Use for homeowner reports and contractor outreach briefs.',
                        parameters: {
                            type: 'object',
                            properties: {
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' },
                                trades: {
                                    type: 'array',
                                    items: { type: 'string', enum: TRADES.map((t) => t.slug) },
                                    description: 'Target trades for lead scoring',
                                },
                                trade: { type: 'string', description: 'Single trade shorthand' },
                                has_septic: { type: 'boolean' },
                                is_rental: { type: 'boolean' },
                            },
                            required: ['address'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'run_lead_scan',
                        description: 'Scan properties within a radius (miles) of a center point for leads matching target trades. Uses configured property data provider; returns scored candidates.',
                        parameters: {
                            type: 'object',
                            properties: {
                                center_lat: { type: 'number' },
                                center_lng: { type: 'number' },
                                radius_miles: { type: 'number', description: 'Travel radius (default 15)' },
                                trades: { type: 'array', items: { type: 'string' } },
                                limit: { type: 'number' },
                            },
                            required: ['center_lat', 'center_lng'],
                            additionalProperties: false,
                        },
                    },
                },
                {
                    type: 'function',
                    function: {
                        name: 'real_estate_data_status',
                        description: 'Check which property data provider is active and whether API keys are configured.',
                        parameters: { type: 'object', properties: {}, additionalProperties: false },
                    },
                },
            ];
        },
        handlers: {
            lookup_property: handle_lookup_property,
            get_property_floor_area: handle_get_property_floor_area,
            get_property_year_built: handle_get_property_year_built,
            search_property_comps: handle_search_property_comps,
            get_property_compliance_timeline: handle_get_property_compliance_timeline,
            get_property_hazard_profile: handle_get_property_hazard_profile,
            lookup_code_violations: handle_lookup_code_violations,
            assess_property_liability: handle_assess_property_liability,
            run_lead_scan: handle_run_lead_scan,
            real_estate_data_status: handle_real_estate_data_status,
        },
    };
}
/** Default export for Reave manifest registration */
export const realEstateDataModule = createRealEstateDataModule();
//# sourceMappingURL=agentTools.js.map