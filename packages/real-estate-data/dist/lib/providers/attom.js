import { loadConfig } from '../config.js';
const BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';
function attomKey() {
    return loadConfig().attom.apiKey;
}
async function attomGet(path, params) {
    const key = attomKey();
    if (!key)
        throw new Error('ATTOM_API_KEY is not set');
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        if (v)
            url.searchParams.set(k, v);
    }
    return fetch(url.toString(), {
        headers: {
            Accept: 'application/json',
            apikey: key,
        },
    });
}
function readStr(obj, ...keys) {
    if (!obj || typeof obj !== 'object')
        return '';
    const rec = obj;
    for (const key of keys) {
        const v = rec[key];
        if (v != null && String(v).trim())
            return String(v).trim();
    }
    return '';
}
function readNum(obj, ...keys) {
    const s = readStr(obj, ...keys);
    if (!s)
        return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
function ownerNameFromProperty(row) {
    const owner = row.owner;
    if (!owner)
        return null;
    const o1 = owner.owner1;
    if (!o1)
        return null;
    const last = readStr(o1, 'lastname', 'lastName');
    const first = readStr(o1, 'firstnameandmi', 'firstNameAndMi', 'firstname', 'firstName');
    const joined = [first, last].filter(Boolean).join(' ').trim();
    return joined || last || null;
}
function mapAttomProperty(row) {
    const identifier = row.identifier;
    const address = row.address;
    const location = row.location;
    const summary = row.summary;
    const building = row.building;
    const buildingSize = building?.size;
    const rooms = building?.rooms;
    const assessment = row.assessment;
    const assessed = assessment?.assessed;
    const market = assessment?.market;
    const sale = row.sale;
    const amount = sale?.amount;
    const attomId = readStr(identifier, 'attomId', 'Id', 'id');
    const line1 = readStr(address, 'line1');
    const locality = readStr(address, 'locality');
    const state = readStr(address, 'countrySubd');
    const zip = readStr(address, 'postal1');
    const oneLine = readStr(address, 'oneLine') || [line1, locality, state, zip].filter(Boolean).join(', ');
    const lat = readNum(location, 'latitude', 'lat');
    const lng = readNum(location, 'longitude', 'lon', 'lng');
    return {
        id: attomId || oneLine || 'unknown',
        fullAddress: oneLine,
        street: line1 || undefined,
        city: locality || undefined,
        state: state || undefined,
        zip: zip || undefined,
        parcelId: readStr(identifier, 'apn') || undefined,
        countyFips: readStr(identifier, 'fips') || undefined,
        yearBuilt: readNum(summary, 'yearbuilt', 'yearBuilt'),
        bedrooms: readNum(rooms, 'beds'),
        bathrooms: readNum(rooms, 'bathstotal', 'bathsTotal'),
        sqft: readNum(buildingSize, 'universalsize', 'universalSize', 'livingsize', 'livingSize'),
        livingAreaSqft: readNum(buildingSize, 'universalsize', 'universalSize', 'livingsize', 'livingSize'),
        propertyType: readStr(summary, 'propclass', 'propClass', 'proptype', 'propType') || null,
        landUseCategory: readStr(summary, 'propLandUse', 'proplanduse') || null,
        ownerName: ownerNameFromProperty(row),
        assessedValue: readNum(assessed, 'assdttlvalue', 'assdTtlValue'),
        marketValue: readNum(market, 'mktttlvalue', 'mktTtlValue') ?? readNum(assessed, 'assdttlvalue', 'assdTtlValue'),
        lastSalePrice: readNum(amount, 'saleamt', 'saleAmt'),
        provider: 'attom',
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        raw: row,
    };
}
function parseAttomResponse(data) {
    const status = data.status;
    const code = status?.code;
    if (code != null && Number(code) !== 0) {
        const msg = readStr(status, 'msg', 'message') || 'ATTOM error';
        throw new Error(msg);
    }
    const rows = data.property;
    if (!Array.isArray(rows))
        return [];
    return rows.map((row) => mapAttomProperty(row));
}
export async function attomSearchRadius(input) {
    const radius = Math.min(20, Math.max(0.1, input.radiusMiles));
    const pageSize = String(Math.min(50, Math.max(1, input.pageSize ?? 25)));
    const res = await attomGet('/property/detailowner', {
        latitude: String(input.centerLat),
        longitude: String(input.centerLng),
        radius: String(radius),
        pageSize,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ATTOM ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json());
    return parseAttomResponse(data);
}
export const attomProvider = {
    id: 'attom',
    configured: () => !!loadConfig().attom.apiKey,
    async lookupProperty(input) {
        const params = { pageSize: '5' };
        if (input.parcelId && input.countyFips) {
            params.fips = input.countyFips;
            params.APN = input.parcelId;
        }
        else {
            const address = [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ');
            if (!address.trim()) {
                return { ok: false, error: 'address or parcelId is required', code: 'INVALID_INPUT' };
            }
            params.address = address;
        }
        try {
            const res = await attomGet('/property/detailowner', params);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                return { ok: false, error: `ATTOM ${res.status}: ${text.slice(0, 300)}`, code: 'HTTP_ERROR' };
            }
            const data = (await res.json());
            const properties = parseAttomResponse(data);
            if (!properties.length) {
                return { ok: false, error: 'No property matched', code: 'NOT_FOUND' };
            }
            return { ok: true, properties, coverageStatus: 'attom' };
        }
        catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'ATTOM request failed', code: 'NETWORK' };
        }
    },
};
//# sourceMappingURL=attom.js.map