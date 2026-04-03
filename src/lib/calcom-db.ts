import pg from 'pg';

const { Pool } = pg;

// Use process.env for server-side runtime variables
export const CALCOM_DB_URL = process.env.CALCOM_DATABASE_URL || import.meta.env.CALCOM_DATABASE_URL || '';
export const CALCOM_USERNAME = process.env.CALCOM_USERNAME || import.meta.env.CALCOM_USERNAME || 'reave';
export const CALCOM_BASE_URL = process.env.CALCOM_API_URL || import.meta.env.CALCOM_API_URL || 'https://cal.reave.app';
export const TIMEZONE = 'America/New_York';

export const pool = new Pool({
  connectionString: CALCOM_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

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
