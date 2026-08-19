import { COURT_DIRECTORY, DIRECTORY_COUNTIES, type CourtVenue } from './courtDirectory';
import { getOfficeCoordinates } from './mapbox';
import { getPracticeGate, type PracticeGate } from './practiceGate';

export type CourtMatch = CourtVenue & { miles: number; reason: 'radius' | 'county' | 'both' };

export type CourtGateResult = {
  origin: { lat: number; lng: number; label: string } | null;
  gate: PracticeGate;
  counties: readonly string[];
  courts: CourtMatch[];
};

const EARTH_MI = 3958.8;

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r1 = (a.lat * Math.PI) / 180;
  const r2 = (b.lat * Math.PI) / 180;
  const dLat = r2 - r1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r1) * Math.cos(r2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoJSON polygon for a Mapbox radius circle. */
export function radiusCircle(
  origin: { lat: number; lng: number },
  miles: number,
  steps = 64,
): { type: 'Polygon'; coordinates: [number, number][][] } {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat = origin.lat + (miles / EARTH_MI) * (180 / Math.PI) * Math.cos(bearing);
    const lng =
      origin.lng +
      ((miles / EARTH_MI) * (180 / Math.PI) * Math.sin(bearing)) / Math.cos((origin.lat * Math.PI) / 180);
    coords.push([lng, lat]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

export function filterCourts(
  origin: { lat: number; lng: number } | null,
  gate: PracticeGate,
  directory: CourtVenue[] = COURT_DIRECTORY,
): CourtMatch[] {
  const selected = new Set(gate.counties.map((c) => c.toLowerCase()));
  const out: CourtMatch[] = [];
  for (const venue of directory) {
    const miles = origin ? milesBetween(origin, venue) : Number.POSITIVE_INFINITY;
    const inRadius = Boolean(origin) && miles <= gate.radiusMi;
    const inCounty = venue.counties.some((c) => selected.has(c.toLowerCase()));
    let reason: CourtMatch['reason'] | null = null;
    if (gate.gateMode === 'radius' && inRadius) reason = 'radius';
    if (gate.gateMode === 'counties' && inCounty) reason = 'county';
    if (gate.gateMode === 'both') {
      if (inRadius && inCounty) reason = 'both';
      else if (inRadius) reason = 'radius';
      else if (inCounty) reason = 'county';
    }
    if (!reason) continue;
    out.push({ ...venue, miles: Number.isFinite(miles) ? Math.round(miles * 10) / 10 : 0, reason });
  }
  return out.sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
}

export async function resolveCourtGate(): Promise<CourtGateResult> {
  const [origin, gate] = await Promise.all([getOfficeCoordinates(), getPracticeGate()]);
  return {
    origin,
    gate,
    counties: DIRECTORY_COUNTIES,
    courts: filterCourts(origin, gate),
  };
}

export function renderCourtsKnowledge(result: CourtGateResult): string {
  const lines = [
    '---',
    'title: Courts in this office’s gate',
    'tags: [courts, map, radius, counties]',
    '---',
    '',
    '# Courts in this office’s gate',
    '',
    result.origin
      ? `Office pin: **${result.origin.label}**. Gate: **${result.gate.gateMode}** · radius **${result.gate.radiusMi} mi**` +
        (result.gate.counties.length ? ` · counties ${result.gate.counties.join(', ')}` : '') +
        '.'
      : 'No office address is set — add one in Company (or the deploy wizard) so the Mapbox pin and radius can resolve.',
    '',
    'Do not invent a courthouse, judge, or phone number that is not listed here. Confirm on the court site if a number looks stale.',
    '',
  ];
  if (!result.courts.length) {
    lines.push('_No directory venues match this gate yet. Widen the radius, add a county, or extend the court directory._');
    return lines.join('\n');
  }
  for (const court of result.courts) {
    lines.push(`## ${court.name}`);
    lines.push('');
    lines.push(`${court.address}, ${court.city}, ${court.state}`);
    if (Number.isFinite(court.miles) && court.miles < 500) lines.push(`${court.miles} miles from the office pin (${court.reason}).`);
    if (court.phone) lines.push(`Phone: ${court.phone}`);
    if (court.fax) lines.push(`Fax: ${court.fax}`);
    if (court.email) lines.push(`Email: ${court.email}`);
    if (court.hours) lines.push(`Hours: ${court.hours}`);
    lines.push(`Counties: ${court.counties.join(', ')}`);
    if (court.notes) lines.push(court.notes);
    if (court.staff?.length) {
      lines.push('');
      for (const person of court.staff) {
        lines.push(
          `- ${person.role}: ${person.name}` +
            (person.phone ? ` · ${person.phone}` : '') +
            (person.email ? ` · ${person.email}` : ''),
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
