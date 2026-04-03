import pg from 'pg';

const { Pool } = pg;

export const TIMEZONE = 'America/New_York';

// Lazy getters that read env vars at runtime, not at module load time
function getCalcomDbUrl(): string {
  return process.env.CALCOM_DATABASE_URL || import.meta.env.CALCOM_DATABASE_URL || '';
}

function getCalcomUsername(): string {
  return process.env.CALCOM_USERNAME || import.meta.env.CALCOM_USERNAME || 'reave';
}

function getCalcomBaseUrl(): string {
  return process.env.CALCOM_API_URL || import.meta.env.CALCOM_API_URL || 'https://cal.reave.app';
}

// Lazy pool creation - only create when first accessed
let _pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!_pool) {
    const dbUrl = getCalcomDbUrl();
    if (!dbUrl) {
      throw new Error('CALCOM_DATABASE_URL is not defined at runtime');
    }
    _pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return _pool;
}

// Export getters as properties (will be accessed at runtime, not module load)
export { getCalcomDbUrl as CALCOM_DB_URL_GETTER };
export const CALCOM_DB_URL = getCalcomDbUrl();
export const CALCOM_USERNAME = getCalcomUsername();
export const CALCOM_BASE_URL = getCalcomBaseUrl();

// Export pool as a getter to ensure lazy initialization
export { getPool as pool };

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  }).replace(':00', '').toLowerCase();
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: TIMEZONE });
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: TIMEZONE });
  const num = parseInt(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TIMEZONE }));
  const suffix = [11, 12, 13].includes(num % 100) ? 'th'
    : num % 10 === 1 ? 'st'
    : num % 10 === 2 ? 'nd'
    : num % 10 === 3 ? 'rd' : 'th';
  return `${day} ${month} ${num}${suffix}`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TIMEZONE });
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: TIMEZONE });
  const num = parseInt(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TIMEZONE }));
  return `${day} ${month} ${num}`;
}
