/** Normalize municipality / address strings for registry lookup. */
export function normalizeCityKey(city, state) {
    const c = (city ?? '').trim().toLowerCase();
    const s = (state ?? '').trim().toUpperCase();
    if (!c || !s)
        return '';
    return `${c},${s.toLowerCase()}`;
}
/** Boston neighborhoods appear as violation_city in open data — map to parent municipality. */
const NEIGHBORHOOD_TO_CITY = {
    'east boston,ma': 'boston,ma',
    'hyde park,ma': 'boston,ma',
    'dorchester,ma': 'boston,ma',
    'roxbury,ma': 'boston,ma',
    'jamaica plain,ma': 'boston,ma',
    'mattapan,ma': 'boston,ma',
    'west roxbury,ma': 'boston,ma',
    'charlestown,ma': 'boston,ma',
    'south boston,ma': 'boston,ma',
    'allston,ma': 'boston,ma',
    'brighton,ma': 'boston,ma',
};
export function resolveFeedCityKey(city, state) {
    const key = normalizeCityKey(city, state);
    return NEIGHBORHOOD_TO_CITY[key] ?? key;
}
export function parseStreetAddress(address) {
    const trimmed = (address ?? '').trim();
    const m = trimmed.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    if (!m)
        return { streetNumber: '', streetName: trimmed };
    return { streetNumber: m[1], streetName: m[2].replace(/\s*,.*$/, '').trim() };
}
export function normalizeStreetToken(value) {
    return (value ?? '')
        .toUpperCase()
        .replace(/\./g, '')
        .replace(/\b(STREET|ST|AVENUE|AVE|ROAD|RD|LANE|LN|DRIVE|DR|BOULEVARD|BLVD|COURT|CT|PLACE|PL|WAY|TERRACE|TER)\b/g, (m) => {
        const map = {
            STREET: 'ST',
            ST: 'ST',
            AVENUE: 'AVE',
            AVE: 'AVE',
            ROAD: 'RD',
            RD: 'RD',
            LANE: 'LN',
            LN: 'LN',
            DRIVE: 'DR',
            DR: 'DR',
            BOULEVARD: 'BLVD',
            BLVD: 'BLVD',
            COURT: 'CT',
            CT: 'CT',
            PLACE: 'PL',
            PL: 'PL',
            WAY: 'WAY',
            TERRACE: 'TER',
            TER: 'TER',
        };
        return map[m] ?? m;
    })
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export function mapViolationStatus(raw) {
    const s = (raw ?? '').trim().toLowerCase();
    if (!s)
        return 'unknown';
    if (/(^open$|^active$|^cited$|^pending$|^issued$|in progress|violation)/.test(s) && !/complete|closed|resolved|dismissed|abated/.test(s)) {
        return 'open';
    }
    if (/complete|closed|resolved|dismissed|abated|complied/.test(s))
        return 'resolved';
    return 'unknown';
}
//# sourceMappingURL=normalize.js.map