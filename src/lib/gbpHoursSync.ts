/**
 * Push Company → Hours onto Google Business Profile when sync is enabled.
 */
import { getCompanyConfig } from './companyConfig';
import { syncBusinessHoursToGbp } from './googleBusinessProfileClient';
import { agencySubject } from './integrationTokens';

export type GbpHoursSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  locationName?: string;
  periodCount?: number;
};

export async function syncGbpHoursFromReave(opts?: {
  request?: Request;
}): Promise<GbpHoursSyncResult> {
  const company = await getCompanyConfig(opts?.request);
  if (!company.syncHoursToGbp) {
    return { ok: true, skipped: true, reason: 'sync to Google Business Profile is off' };
  }
  if (!company.businessHours) {
    return { ok: true, skipped: true, reason: 'no company hours to sync' };
  }

  const result = await syncBusinessHoursToGbp({
    subject: agencySubject(),
    hours: company.businessHours,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    locationName: result.locationName,
    periodCount: result.periodCount,
  };
}
