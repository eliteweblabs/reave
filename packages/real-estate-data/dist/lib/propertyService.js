import { lookupProperty } from './providers/index.js';
function parseFloorArg(floor, floorLabel) {
    if (floor != null)
        return floor;
    if (!floorLabel)
        return undefined;
    const lower = floorLabel.toLowerCase();
    const ordinals = {
        first: 1,
        '1st': 1,
        second: 2,
        '2nd': 2,
        third: 3,
        '3rd': 3,
        basement: 'basement',
        attic: 'attic',
    };
    for (const [key, val] of Object.entries(ordinals)) {
        if (lower.includes(key))
            return val;
    }
    return floorLabel;
}
/**
 * Resolve per-floor square footage when available.
 * Most assessor APIs only return total building sqft — per-floor data is uncommon.
 */
export async function getFloorArea(input) {
    const result = await lookupProperty({
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
    });
    if (!result.ok)
        return { ok: false, error: result.error, code: result.code };
    const property = result.properties[0];
    if (!property) {
        return { ok: false, error: 'No property matched that address', code: 'NOT_FOUND' };
    }
    const floor = parseFloorArg(input.floor, input.floorLabel);
    if (property.floorAreas?.length && floor != null) {
        const match = property.floorAreas.find((f) => {
            if (typeof floor === 'number')
                return f.floor === floor;
            return String(f.floor).toLowerCase() === String(floor).toLowerCase();
        });
        if (match) {
            return {
                ok: true,
                floor: match.floor,
                sqft: match.sqft,
                source: 'floor_areas',
                property,
            };
        }
    }
    const total = property.livingAreaSqft ?? property.sqft;
    const stories = property.stories ?? 2;
    if (total && stories && stories > 1 && typeof floor === 'number') {
        const estimated = Math.round(total / stories);
        return {
            ok: true,
            floor,
            sqft: estimated,
            source: 'estimated_even_split',
            property,
            note: `Assessor data has total building area (${total} sqft) across ${stories} stories — per-floor breakdown not in source; estimate assumes even split.`,
        };
    }
    if (total) {
        return {
            ok: true,
            sqft: total,
            source: 'total_building_only',
            property,
            note: 'Source provides total building square footage only — no per-floor breakdown.',
        };
    }
    return {
        ok: false,
        error: 'No square footage data available for this property from the current provider',
        code: 'NO_SQFT',
    };
}
export { lookupProperty, lookupComps, getActiveProvider, listProviders } from './providers/index.js';
export { isRealEstateDataConfigured, loadConfig } from './config.js';
//# sourceMappingURL=propertyService.js.map