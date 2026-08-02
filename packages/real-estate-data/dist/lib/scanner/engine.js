import { distanceMiles, isWithinRadiusMiles } from '../geo/haversine.js';
import { scoreLeadForTrades } from '../leads/score.js';
import { normalizeTradeSlugs } from '../trades.js';
/** Deterministic mock candidates around a center for dev/demo scans. */
function mockCandidatesNear(centerLat, centerLng, location) {
    const city = location?.city?.trim() || 'Local Area';
    const state = location?.state?.trim().toUpperCase() || 'US';
    const zip = location?.zip?.trim() || '00000';
    const offsets = [
        { dLat: 0.01, dLng: 0.008, address: '45 Oak Avenue', yearBuilt: 1962, owner: 'SMITH JOHN & MARY' },
        { dLat: -0.012, dLng: 0.005, address: '88 Pine Road', yearBuilt: 1938, owner: 'PINE HOLDINGS LLC' },
        { dLat: 0.006, dLng: -0.015, address: '210 Elm Street', yearBuilt: 2004, owner: 'ELM FAMILY TRUST' },
        { dLat: -0.008, dLng: -0.01, address: '123 Main Street', yearBuilt: 1924, owner: 'EXAMPLE HOLDINGS LLC' },
        { dLat: 0.018, dLng: 0.002, address: '5 River Lane', yearBuilt: 1971, owner: 'RIVER VIEW PROPERTIES' },
    ];
    const specs = [
        { marketValue: 485000, assessedValue: 412000, bedrooms: 3, bathrooms: 2, lastSalePrice: 318000, propertyType: 'Single family' },
        { marketValue: 625000, assessedValue: 540000, bedrooms: 4, bathrooms: 2.5, lastSalePrice: 89000, propertyType: 'Multi-family' },
        { marketValue: 720000, assessedValue: 655000, bedrooms: 4, bathrooms: 3, lastSalePrice: 510000, propertyType: 'Single family' },
        { marketValue: 395000, assessedValue: 348000, bedrooms: 3, bathrooms: 1.5, lastSalePrice: 145000, propertyType: 'Single family' },
        { marketValue: 540000, assessedValue: 478000, bedrooms: 3, bathrooms: 2, lastSalePrice: 275000, propertyType: 'Waterfront' },
    ];
    return offsets.map((o, i) => ({
        id: `mock-scan-${Math.round(centerLat * 1000)}-${Math.round(centerLng * 1000)}-${i}`,
        fullAddress: zip ? `${o.address}, ${city}, ${state} ${zip}` : `${o.address}, ${city}, ${state}`,
        street: o.address,
        city,
        state,
        zip,
        yearBuilt: o.yearBuilt,
        sqft: 1800 + i * 400,
        livingAreaSqft: 1800 + i * 400,
        bedrooms: specs[i].bedrooms,
        bathrooms: specs[i].bathrooms,
        marketValue: specs[i].marketValue,
        assessedValue: specs[i].assessedValue,
        lastSalePrice: specs[i].lastSalePrice,
        propertyType: specs[i].propertyType,
        landUseCategory: specs[i].propertyType,
        stories: o.yearBuilt < 1960 ? 2 : 1,
        ownerName: o.owner,
        floodZone: i === 4 ? 'AE' : 'X',
        provider: 'mock',
        lat: centerLat + o.dLat,
        lng: centerLng + o.dLng,
    }));
}
export function runRadiusScan(config) {
    const trades = normalizeTradeSlugs(config.trades);
    const max = config.maxResults ?? 25;
    const raw = mockCandidatesNear(config.centerLat, config.centerLng, config.centerLocation);
    const candidates = [];
    for (const row of raw) {
        const dist = distanceMiles(config.centerLat, config.centerLng, row.lat, row.lng);
        if (!isWithinRadiusMiles(config.centerLat, config.centerLng, row.lat, row.lng, config.radiusMiles)) {
            continue;
        }
        const lead = scoreLeadForTrades(row, trades, {
            hasSeptic: row.landUseCategory?.toLowerCase().includes('rural'),
            recentStorm: false,
        });
        if (lead.score <= 0 && trades.length > 0)
            continue;
        candidates.push({
            ...row,
            distanceMiles: Math.round(dist * 10) / 10,
            leadScore: lead.score,
            leadReasons: lead.reasons,
            matchedTrades: lead.matchedTrades,
        });
    }
    candidates.sort((a, b) => b.leadScore - a.leadScore || a.distanceMiles - b.distanceMiles);
    return {
        ok: true,
        scannedAt: new Date().toISOString(),
        center: { lat: config.centerLat, lng: config.centerLng },
        radiusMiles: config.radiusMiles,
        trades,
        candidatesFound: candidates.length,
        candidates: candidates.slice(0, max),
    };
}
//# sourceMappingURL=engine.js.map