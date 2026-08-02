/**
 * Lead scanner config, run history, and dedupe for property lead cron.
 */
import pg from 'pg';
import { getPgPool } from './pgPool';

export type LeadScannerConfig = {
  enabled: boolean;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number;
  trades: string[];
  useCompanyOffice: boolean;
  scanHourLocal: number;
  lastRunAt: string | null;
  updatedAt: string | null;
};

export type StoredScanCandidate = {
  id: string;
  fullAddress: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  yearBuilt?: number | null;
  ownerName?: string | null;
  lat: number;
  lng: number;
  distanceMiles: number;
  leadScore: number;
  leadReasons: string[];
  matchedTrades: string[];
  sqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  marketValue?: number | null;
  assessedValue?: number | null;
  lastSalePrice?: number | null;
  propertyType?: string | null;
  floodZone?: string | null;
};

export type LeadScannerRun = {
  id: string;
  ranAt: string;
  source: 'cron' | 'manual' | 'admin';
  candidatesFound: number;
  /** Projects created from this run after explicit review/import. */
  importedCount: number;
  errors: string[];
  candidates?: StoredScanCandidate[];
};

export type ImportedLeadRecord = {
  propertyId: string;
  jobSlug?: string | null;
  contactUid?: string | null;
};

const DEFAULT_TRADES = ['plumbing', 'roofing', 'general_contractor', 'electrical', 'hvac'];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS lead_scanner_config (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled          BOOLEAN NOT NULL DEFAULT false,
  center_lat       DOUBLE PRECISION,
  center_lng       DOUBLE PRECISION,
  radius_miles     DOUBLE PRECISION NOT NULL DEFAULT 15,
  trades           JSONB NOT NULL DEFAULT '[]'::jsonb,
  use_company_office BOOLEAN NOT NULL DEFAULT true,
  scan_hour_local  INT NOT NULL DEFAULT 6,
  timezone         TEXT NOT NULL DEFAULT 'America/New_York',
  last_run_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_scanner_runs (
  id               UUID PRIMARY KEY,
  ran_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source           TEXT NOT NULL DEFAULT 'cron',
  candidates_found INT NOT NULL DEFAULT 0,
  new_leads        INT NOT NULL DEFAULT 0,
  skipped          INT NOT NULL DEFAULT 0,
  errors           JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidates       JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS lead_scanner_seen (
  property_id      TEXT NOT NULL,
  address_key      TEXT NOT NULL,
  contact_uid      TEXT,
  job_slug         TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_scanner_seen_address ON lead_scanner_seen (address_key);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  await pool.query(`ALTER TABLE lead_scanner_runs ADD COLUMN IF NOT EXISTS candidates JSONB NOT NULL DEFAULT '[]'::jsonb`);
  return pool;
}

function defaultConfig(): LeadScannerConfig {
  return {
    enabled: false,
    centerLat: null,
    centerLng: null,
    radiusMiles: 15,
    trades: [...DEFAULT_TRADES],
    useCompanyOffice: true,
    scanHourLocal: 6,
    lastRunAt: null,
    updatedAt: null,
  };
}

function rowToConfig(row: Record<string, unknown>): LeadScannerConfig {
  const tradesRaw = row.trades;
  let trades: string[] = DEFAULT_TRADES;
  if (Array.isArray(tradesRaw)) trades = tradesRaw.map(String);
  else if (typeof tradesRaw === 'string') {
    try {
      const parsed = JSON.parse(tradesRaw) as unknown;
      if (Array.isArray(parsed)) trades = parsed.map(String);
    } catch {
      /* keep default */
    }
  }

  return {
    enabled: Boolean(row.enabled),
    centerLat: row.center_lat != null ? Number(row.center_lat) : null,
    centerLng: row.center_lng != null ? Number(row.center_lng) : null,
    radiusMiles: Number(row.radius_miles ?? 15),
    trades,
    useCompanyOffice: row.use_company_office !== false,
    scanHourLocal: Number(row.scan_hour_local ?? 6),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function getLeadScannerConfig(): Promise<LeadScannerConfig> {
  const pool = await ensureSchema();
  if (!pool) return defaultConfig();
  const res = await pool.query('SELECT * FROM lead_scanner_config WHERE id = 1');
  if (!res.rows[0]) {
    await pool.query(
      `INSERT INTO lead_scanner_config (id, trades) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(DEFAULT_TRADES)],
    );
    return defaultConfig();
  }
  return rowToConfig(res.rows[0]);
}

export async function saveLeadScannerConfig(
  patch: Partial<LeadScannerConfig>,
): Promise<LeadScannerConfig> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('DATABASE_URL required for lead scanner config');
  const current = await getLeadScannerConfig();
  const next: LeadScannerConfig = {
    ...current,
    ...patch,
    radiusMiles: Math.max(1, Math.min(patch.radiusMiles ?? current.radiusMiles, 100)),
    scanHourLocal: Math.max(0, Math.min(patch.scanHourLocal ?? current.scanHourLocal, 23)),
  };

  await pool.query(
    `INSERT INTO lead_scanner_config (
      id, enabled, center_lat, center_lng, radius_miles, trades,
      use_company_office, scan_hour_local, updated_at
    ) VALUES (1, $1, $2, $3, $4, $5::jsonb, $6, $7, now())
    ON CONFLICT (id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      center_lat = EXCLUDED.center_lat,
      center_lng = EXCLUDED.center_lng,
      radius_miles = EXCLUDED.radius_miles,
      trades = EXCLUDED.trades,
      use_company_office = EXCLUDED.use_company_office,
      scan_hour_local = EXCLUDED.scan_hour_local,
      updated_at = now()`,
    [
      next.enabled,
      next.centerLat,
      next.centerLng,
      next.radiusMiles,
      JSON.stringify(next.trades),
      next.useCompanyOffice,
      next.scanHourLocal,
    ],
  );

  return getLeadScannerConfig();
}

export async function markLeadScannerRun(input: {
  source: LeadScannerRun['source'];
  candidatesFound: number;
  importedCount?: number;
  errors?: string[];
  candidates?: StoredScanCandidate[];
}): Promise<string> {
  const pool = await ensureSchema();
  if (!pool) return '';
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO lead_scanner_runs (id, source, candidates_found, new_leads, skipped, errors, candidates)
     VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb)`,
    [
      id,
      input.source,
      input.candidatesFound,
      input.importedCount ?? 0,
      JSON.stringify(input.errors ?? []),
      JSON.stringify(input.candidates ?? []),
    ],
  );
  await pool.query(`UPDATE lead_scanner_config SET last_run_at = now(), updated_at = now() WHERE id = 1`);
  return id;
}

function rowToRun(row: Record<string, unknown>, includeCandidates = false): LeadScannerRun {
  let candidates: StoredScanCandidate[] | undefined;
  if (includeCandidates) {
    const raw = row.candidates;
    if (Array.isArray(raw)) candidates = raw as StoredScanCandidate[];
    else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) candidates = parsed as StoredScanCandidate[];
      } catch {
        candidates = [];
      }
    } else {
      candidates = [];
    }
  }

  return {
    id: String(row.id),
    ranAt: String(row.ran_at),
    source: row.source as LeadScannerRun['source'],
    candidatesFound: Number(row.candidates_found),
    importedCount: Number(row.new_leads ?? 0),
    errors: Array.isArray(row.errors) ? row.errors.map(String) : [],
    candidates,
  };
}

export async function getLeadScannerRun(
  runId: string,
  includeCandidates = true,
): Promise<LeadScannerRun | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT id, ran_at, source, candidates_found, new_leads, skipped, errors, candidates
     FROM lead_scanner_runs WHERE id = $1 LIMIT 1`,
    [runId],
  );
  if (!res.rows[0]) return null;
  return rowToRun(res.rows[0], includeCandidates);
}

export async function getLatestLeadScannerRun(includeCandidates = true): Promise<LeadScannerRun | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT id, ran_at, source, candidates_found, new_leads, skipped, errors, candidates
     FROM lead_scanner_runs ORDER BY ran_at DESC LIMIT 1`,
  );
  if (!res.rows[0]) return null;
  return rowToRun(res.rows[0], includeCandidates);
}

export async function incrementRunImportedCount(runId: string, delta: number): Promise<void> {
  const pool = await ensureSchema();
  if (!pool || delta <= 0) return;
  await pool.query(
    `UPDATE lead_scanner_runs SET new_leads = COALESCE(new_leads, 0) + $2 WHERE id = $1`,
    [runId, delta],
  );
}

export async function isLeadSeen(propertyId: string): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  const res = await pool.query('SELECT 1 FROM lead_scanner_seen WHERE property_id = $1 LIMIT 1', [propertyId]);
  return (res.rowCount ?? 0) > 0;
}

export async function markLeadSeen(input: {
  propertyId: string;
  addressKey: string;
  contactUid?: string | null;
  jobSlug?: string | null;
}): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;
  await pool.query(
    `INSERT INTO lead_scanner_seen (property_id, address_key, contact_uid, job_slug)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (property_id) DO UPDATE SET
       last_seen_at = now(),
       contact_uid = COALESCE(EXCLUDED.contact_uid, lead_scanner_seen.contact_uid),
       job_slug = COALESCE(EXCLUDED.job_slug, lead_scanner_seen.job_slug)`,
    [input.propertyId, input.addressKey, input.contactUid ?? null, input.jobSlug ?? null],
  );
}

export async function listRecentLeadScannerRuns(limit = 10): Promise<LeadScannerRun[]> {
  const pool = await ensureSchema();
  if (!pool) return [];
  const res = await pool.query(
    `SELECT id, ran_at, source, candidates_found, new_leads, skipped, errors
     FROM lead_scanner_runs ORDER BY ran_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((row) => rowToRun(row, false));
}

export async function listImportedLeads(propertyIds: string[]): Promise<ImportedLeadRecord[]> {
  const pool = await ensureSchema();
  if (!pool || propertyIds.length === 0) return [];
  const res = await pool.query(
    `SELECT property_id, job_slug, contact_uid
     FROM lead_scanner_seen
     WHERE property_id = ANY($1::text[])`,
    [propertyIds],
  );
  return res.rows.map((row) => ({
    propertyId: String(row.property_id),
    jobSlug: row.job_slug ? String(row.job_slug) : null,
    contactUid: row.contact_uid ? String(row.contact_uid) : null,
  }));
}

export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bst\b\.?/g, 'street')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
