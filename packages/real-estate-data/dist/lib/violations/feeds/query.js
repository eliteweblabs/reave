import { mapViolationStatus, normalizeStreetToken, parseStreetAddress } from '../normalize.js';
function rowVal(row, field) {
    if (!field)
        return '';
    const v = row[field];
    return v == null ? '' : String(v).trim();
}
function mapRow(row, feed, source) {
    const f = feed.fields;
    const statusRaw = rowVal(row, f.status);
    const openValues = feed.openStatusValues ?? [];
    let status = mapViolationStatus(statusRaw);
    if (openValues.length && statusRaw) {
        status = openValues.some((v) => v.toLowerCase() === statusRaw.toLowerCase()) ? 'open' : status;
    }
    return {
        id: rowVal(row, f.id) || `${source}-${rowVal(row, f.description).slice(0, 40)}`,
        category: rowVal(row, f.category) || 'code',
        description: rowVal(row, f.description) || 'Municipal code violation',
        status,
        issuedAt: rowVal(row, f.issuedAt) || null,
        source,
    };
}
function addressMatches(input, row, feed) {
    const f = feed.fields;
    const parsed = parseStreetAddress(input.address);
    const inputStreet = normalizeStreetToken(parsed.streetName);
    const inputNum = parsed.streetNumber;
    if (f.fullAddress) {
        const full = rowVal(row, f.fullAddress).toLowerCase();
        const needle = input.address.toLowerCase();
        if (full && (full.includes(needle) || needle.includes(full.split(',')[0] ?? '')))
            return true;
    }
    const rowStreet = normalizeStreetToken(rowVal(row, f.street));
    const rowNum = rowVal(row, f.streetNumber);
    if (!rowStreet && !rowNum)
        return false;
    if (inputNum && rowNum && inputNum !== rowNum)
        return false;
    if (inputStreet && rowStreet) {
        return rowStreet.includes(inputStreet) || inputStreet.includes(rowStreet);
    }
    return false;
}
export async function queryCkanFeed(feed, input) {
    const parsed = parseStreetAddress(input.address);
    const filters = {};
    if (feed.fields.street && parsed.streetName) {
        const streetToken = parsed.streetName.split(/\s+/)[0]?.toUpperCase();
        if (streetToken)
            filters[feed.fields.street] = streetToken;
    }
    if (feed.fields.streetNumber && parsed.streetNumber) {
        filters[feed.fields.streetNumber] = parsed.streetNumber;
    }
    const url = new URL(feed.baseUrl);
    url.searchParams.set('resource_id', feed.resourceId);
    url.searchParams.set('limit', '25');
    if (Object.keys(filters).length) {
        url.searchParams.set('filters', JSON.stringify(filters));
    }
    const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': 'Reave/1.0 (municipal violations lookup)' },
    });
    if (!res.ok)
        throw new Error(`CKAN ${res.status}`);
    const data = (await res.json());
    const records = data.result?.records ?? [];
    const source = feed.label;
    return records.filter((row) => addressMatches(input, row, feed)).map((row) => mapRow(row, feed, source));
}
export async function querySocrataFeed(feed, input, appToken) {
    const parsed = parseStreetAddress(input.address);
    const url = new URL(`https://${feed.domain}/resource/${feed.datasetId}.json`);
    url.searchParams.set('$limit', '25');
    if (feed.fields.fullAddress && input.address.trim()) {
        const token = parsed.streetNumber || parsed.streetName.split(/\s+/)[0] || input.address.split(/\s+/)[0];
        if (token)
            url.searchParams.set('$where', `upper(${feed.fields.fullAddress}) like '%${token.toUpperCase()}%'`);
    }
    else if (feed.fields.street && parsed.streetName) {
        const token = parsed.streetName.split(/\s+/)[0]?.toUpperCase();
        if (token)
            url.searchParams.set('$where', `upper(${feed.fields.street}) like '%${token}%'`);
    }
    const headers = {
        Accept: 'application/json',
        'User-Agent': 'Reave/1.0 (municipal violations lookup)',
    };
    if (appToken)
        headers['X-App-Token'] = appToken;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok)
        throw new Error(`Socrata ${res.status}`);
    const records = (await res.json());
    const source = feed.label;
    return records.filter((row) => addressMatches(input, row, feed)).map((row) => mapRow(row, feed, source));
}
export async function queryFeed(feed, input, appToken) {
    if (feed.type === 'ckan')
        return queryCkanFeed(feed, input);
    return querySocrataFeed(feed, input, appToken);
}
//# sourceMappingURL=query.js.map