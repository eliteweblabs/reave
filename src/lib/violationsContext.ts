/**
 * Municipal violation service area — derived from company office address in admin settings.
 */
import { describeViolationServiceArea, type ServiceAreaConfig } from '@reave/plugin-real-estate-data';
import { getCompanyConfig } from './companyConfig';
import { resolveAddressCoordinates } from './mapbox';

const DEFAULT_RADIUS_MILES = 30;
const DEFAULT_TOP_PERCENT = 0.5;

export async function getViolationServiceAreaConfig(): Promise<ServiceAreaConfig | null> {
  const company = await getCompanyConfig();
  if (company.geo?.lat != null && company.geo?.lng != null) {
    return {
      centerLat: company.geo.lat,
      centerLng: company.geo.lng,
      radiusMiles: DEFAULT_RADIUS_MILES,
      topPercent: DEFAULT_TOP_PERCENT,
    };
  }

  const address = (company.address ?? '').trim();
  if (!address) return null;

  const coords = await resolveAddressCoordinates(address);
  if (!coords) return null;

  return {
    centerLat: coords.lat,
    centerLng: coords.lng,
    radiusMiles: DEFAULT_RADIUS_MILES,
    topPercent: DEFAULT_TOP_PERCENT,
  };
}

export async function getViolationServiceAreaSummary() {
  const config = await getViolationServiceAreaConfig();
  if (!config) return null;
  return describeViolationServiceArea(config);
}
