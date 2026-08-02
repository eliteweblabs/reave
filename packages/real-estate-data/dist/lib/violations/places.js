import { distanceMiles } from '../geo/haversine.js';
import { normalizeCityKey } from './normalize.js';
import placesData from './data/us-places.json' with { type: 'json' };
const PLACES = placesData;
export function resolveServiceAreaMunicipalities(config, feedCityKeys) {
    const radius = config.radiusMiles ?? 30;
    const topPercent = config.topPercent ?? 0.5;
    if (!Number.isFinite(config.centerLat) || !Number.isFinite(config.centerLng))
        return [];
    const inRadius = PLACES.map((place) => {
        const dist = distanceMiles(config.centerLat, config.centerLng, place.lat, place.lng);
        return { place, dist };
    })
        .filter(({ dist }) => dist <= radius)
        .sort((a, b) => b.place.p - a.place.p || a.dist - b.dist);
    if (!inRadius.length)
        return [];
    const keepCount = Math.max(1, Math.ceil(inRadius.length * topPercent));
    return inRadius.slice(0, keepCount).map(({ place, dist }) => {
        const cityKey = normalizeCityKey(place.n, place.s);
        return {
            cityKey,
            name: place.n,
            state: place.s,
            population: place.p,
            distanceMiles: Math.round(dist * 10) / 10,
            hasViolationFeed: feedCityKeys.has(cityKey),
        };
    });
}
export function isCityInServiceArea(city, state, serviceArea) {
    const key = normalizeCityKey(city, state);
    if (!key)
        return false;
    return serviceArea.some((m) => m.cityKey === key);
}
//# sourceMappingURL=places.js.map