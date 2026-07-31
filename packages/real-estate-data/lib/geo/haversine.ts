/** Great-circle distance in miles between two WGS84 points. */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadiusMiles(
  centerLat: number,
  centerLng: number,
  pointLat: number,
  pointLng: number,
  radiusMiles: number,
): boolean {
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) return false;
  return distanceMiles(centerLat, centerLng, pointLat, pointLng) <= radiusMiles;
}
