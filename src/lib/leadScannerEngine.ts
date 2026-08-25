/**
 * Daily property lead scan — radius geofence, trade filter, review before CRM intake.
 */
import { runRadiusScan, normalizeTradeSlugs, type ScanCandidate, type ScanCenterLocation } from '@reave/plugin-real-estate-data';
import { getCompanyConfig } from './companyConfig';
import { getDeploymentOwnerTimezone } from './deploymentOwner';
import { hasFeature } from './features';
import {
  getLeadScannerConfig,
  getLeadScannerRun,
  incrementRunImportedCount,
  isLeadSeen,
  markLeadScannerRun,
  markLeadSeen,
  normalizeAddressKey,
  type LeadScannerConfig,
  type StoredScanCandidate,
} from './leadScannerStore';
import { createLogger } from './logger';
import { ensureWorkContact, slugFromTitle, storeWriteWork } from './workStore';

const log = createLogger('lead-scanner');

export type LeadScannerRunResult = {
  ok: boolean;
  skipped?: string;
  candidatesFound?: number;
  runId?: string;
  candidates?: StoredScanCandidate[];
  errors?: string[];
};

export type LeadScannerImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  jobSlugs: string[];
};

export async function resolveScanCenter(
  config: LeadScannerConfig,
): Promise<{ lat: number; lng: number } | null> {
  if (config.centerLat != null && config.centerLng != null) {
    return { lat: config.centerLat, lng: config.centerLng };
  }
  if (config.useCompanyOffice) {
    const company = await getCompanyConfig();
    if (company.geo?.lat != null && company.geo?.lng != null) {
      return { lat: company.geo.lat, lng: company.geo.lng };
    }
  }
  return null;
}

export async function resolveScanLocation(
  center: { lat: number; lng: number },
): Promise<ScanCenterLocation> {
  const company = await getCompanyConfig();
  const { parseUsAddressLocation, reverseGeocodeCoordinates } = await import('./mapbox');
  const parsed = parseUsAddressLocation(company.address);
  if (parsed) return parsed;

  const reversed = await reverseGeocodeCoordinates(center.lat, center.lng);
  if (reversed) return reversed;

  return { city: 'Local Area', state: '', zip: '' };
}

function isScanWindow(
  config: LeadScannerConfig,
  timezone: string,
  now = new Date(),
  ignoreWindow = false,
): boolean {
  if (ignoreWindow) return true;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = Number(fmt.format(now));
    return hour === config.scanHourLocal;
  } catch {
    return true;
  }
}

export function serializeScanCandidate(candidate: ScanCandidate): StoredScanCandidate {
  return {
    id: candidate.id,
    fullAddress: candidate.fullAddress,
    street: candidate.street,
    city: candidate.city,
    state: candidate.state,
    zip: candidate.zip,
    yearBuilt: candidate.yearBuilt ?? null,
    ownerName: candidate.ownerName ?? null,
    lat: candidate.lat,
    lng: candidate.lng,
    distanceMiles: candidate.distanceMiles,
    leadScore: candidate.leadScore,
    leadReasons: candidate.leadReasons,
    matchedTrades: candidate.matchedTrades,
    sqft: candidate.sqft ?? candidate.livingAreaSqft ?? null,
    bedrooms: candidate.bedrooms ?? null,
    bathrooms: candidate.bathrooms ?? null,
    marketValue: candidate.marketValue ?? null,
    assessedValue: candidate.assessedValue ?? null,
    lastSalePrice: candidate.lastSalePrice ?? null,
    propertyType: candidate.propertyType ?? candidate.landUseCategory ?? null,
    floodZone: candidate.floodZone ?? null,
  };
}

function leadProjectBody(candidate: StoredScanCandidate): string {
  const lines = [
    `# Property lead — ${candidate.fullAddress}`,
    '',
    `- **Score:** ${candidate.leadScore}/100`,
    `- **Distance:** ${candidate.distanceMiles} mi`,
    `- **Year built:** ${candidate.yearBuilt ?? 'unknown'}`,
    `- **Owner:** ${candidate.ownerName ?? 'unknown'}`,
    `- **Trades:** ${candidate.matchedTrades.join(', ')}`,
    '',
    '## Reasons',
    ...candidate.leadReasons.map((r) => `- ${r}`),
    '',
    '_Imported from reΛVe.app Lead Scanner after review. Informational — verify before outreach._',
  ];
  return lines.join('\n');
}

async function intakeLead(
  candidate: StoredScanCandidate,
): Promise<{ ok: boolean; contactUid?: string; jobSlug?: string; error?: string }> {
  const owner = (candidate.ownerName ?? '').trim();
  const contactName = owner || `Property owner — ${candidate.street ?? candidate.fullAddress}`;

  const contact = await ensureWorkContact({
    contact_name: contactName,
  });

  if (!contact.ok) {
    return { ok: false, error: contact.error ?? 'Could not create or resolve contact' };
  }

  const tradeLabel = candidate.matchedTrades[0]?.replace(/_/g, ' ') ?? 'property';
  const title = `${tradeLabel} lead — ${candidate.street ?? candidate.fullAddress}`;
  const slug = slugFromTitle(title);

  const write = await storeWriteWork(slug, {
    title,
    contact_uid: contact.uid,
    contact_name: contactName,
    status: 'inquiry',
    source: 'lead_scanner',
    tags: ['lead-scanner', 'real-estate', ...candidate.matchedTrades],
    body: leadProjectBody(candidate),
  });

  if (!write.ok) {
    return { ok: false, error: write.error ?? 'Failed to create project' };
  }

  return { ok: true, contactUid: contact.uid, jobSlug: slug };
}

export function isLeadScannerEnabled(): boolean {
  return hasFeature('real_estate_data');
}

export async function runLeadScanner(options?: {
  source?: 'cron' | 'manual' | 'admin';
  ignoreWindow?: boolean;
  force?: boolean;
}): Promise<LeadScannerRunResult> {
  if (!isLeadScannerEnabled()) {
    return { ok: false, skipped: 'real_estate_data feature not enabled' };
  }

  const config = await getLeadScannerConfig();
  if (!config.enabled && !options?.force) {
    return { ok: false, skipped: 'Lead scanner disabled in admin settings' };
  }

  const timezone = await getDeploymentOwnerTimezone();
  if (!isScanWindow(config, timezone, new Date(), options?.ignoreWindow || options?.force)) {
    return { ok: false, skipped: `Outside scan window (hour ${config.scanHourLocal} ${timezone})` };
  }

  const center = await resolveScanCenter(config);
  if (!center) {
    return { ok: false, skipped: 'Set scan center on map or enable company office location' };
  }

  const centerLocation = await resolveScanLocation(center);
  const trades = normalizeTradeSlugs(config.trades);
  const scan = await runRadiusScan({
    centerLat: center.lat,
    centerLng: center.lng,
    radiusMiles: config.radiusMiles,
    trades,
    maxResults: 50,
    centerLocation,
  });

  if (scan.error) {
    return { ok: false, skipped: scan.error, candidatesFound: 0 };
  }

  const candidates = scan.candidates.map(serializeScanCandidate);

  const runId = await markLeadScannerRun({
    source: options?.source ?? 'cron',
    candidatesFound: scan.candidatesFound,
    candidates,
    errors: [],
  });

  log.info('scan complete', {
    candidates: scan.candidatesFound,
    runId,
  });

  return {
    ok: true,
    candidatesFound: scan.candidatesFound,
    runId,
    candidates,
    errors: [],
  };
}

export async function importLeadScannerCandidates(input: {
  runId: string;
  propertyIds: string[];
}): Promise<LeadScannerImportResult> {
  const propertyIds = [...new Set(input.propertyIds.map(String).filter(Boolean))];
  if (!propertyIds.length) {
    return { ok: false, imported: 0, skipped: 0, errors: ['No properties selected'], jobSlugs: [] };
  }

  const run = await getLeadScannerRun(input.runId, true);
  if (!run?.candidates?.length) {
    return { ok: false, imported: 0, skipped: 0, errors: ['Scan run not found'], jobSlugs: [] };
  }

  const byId = new Map(run.candidates.map((c) => [c.id, c]));
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const jobSlugs: string[] = [];

  for (const propertyId of propertyIds) {
    const candidate = byId.get(propertyId);
    if (!candidate) {
      errors.push(`${propertyId}: not in this scan run`);
      skipped++;
      continue;
    }

    if (await isLeadSeen(propertyId)) {
      skipped++;
      continue;
    }

    const intake = await intakeLead(candidate);
    if (!intake.ok) {
      errors.push(`${candidate.fullAddress}: ${intake.error ?? 'import failed'}`);
      skipped++;
      continue;
    }

    await markLeadSeen({
      propertyId: candidate.id,
      addressKey: normalizeAddressKey(candidate.fullAddress),
      contactUid: intake.contactUid,
      jobSlug: intake.jobSlug,
    });

    if (intake.jobSlug) jobSlugs.push(intake.jobSlug);
    imported++;
  }

  if (imported > 0) {
    await incrementRunImportedCount(input.runId, imported);
  }

  return { ok: true, imported, skipped, errors, jobSlugs };
}
