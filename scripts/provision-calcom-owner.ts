import pg from 'pg';
import { ensureCalcomOwnerEventTypes, provisionCalcomOwner } from '../src/lib/calcomOwnerProvision.ts';

const url = process.env.CALCOM_DATABASE_URL?.trim();
if (!url) throw new Error('CALCOM_DATABASE_URL missing');

const identity = {
  username: process.env.CALCOM_USERNAME?.trim() || 'drpawscalls',
  email: process.env.EMAIL_FROM?.trim() || 'noreply@inbound.reave.app',
  name: process.env.COMPANY_NAME?.trim() || process.env.EMAIL_FROM_NAME?.trim() || 'Dr Paws Calls',
  iconUrl: '',
};
const timezone = process.env.BOOKING_TIMEZONE?.trim() || 'America/New_York';

const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 1,
});

const query = (sql: string, values?: unknown[]) => pool.query(sql, values);

const existing = await pool.query<{ id: number }>(
  'SELECT id FROM users WHERE username = $1 LIMIT 1',
  [identity.username],
);

let userId = existing.rows[0]?.id;
if (!userId) {
  const result = await provisionCalcomOwner(query, identity, timezone);
  console.log('provision:', JSON.stringify(result, null, 2));
  userId = result.userId;
} else {
  const eventTypes = await ensureCalcomOwnerEventTypes(query, userId, timezone);
  console.log('eventTypes seeded:', eventTypes);
}

await pool.end();
