/**
 * Seed demo Cal.com bookings for the admin schedule tab.
 *
 * Usage:
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts --dry-run
 *
 * Uses the public Railway proxy URL from .env.railway.postgres when unset.
 */

import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const DATABASE_URL =
  process.env.CALCOM_DATABASE_URL?.trim() ||
  process.env.DATABASE_PUBLIC_URL?.trim() ||
  'postgresql://postgres:tcaUYFmferhLaAVtuqTHkDoQBIiTxhom@turntable.proxy.rlwy.net:48169/railway?sslmode=require';

const CALCOM_USERNAME = process.env.CALCOM_USERNAME?.trim() || 'reave';
const TIMEZONE = process.env.BOOKING_TIMEZONE?.trim() || 'America/New_York';

type DemoBooking = {
  name: string;
  email: string;
  phone?: string;
  /** Local wall-clock time in BOOKING_TIMEZONE (not UTC). */
  startLocal: string; // "YYYY-MM-DD HH:mm:ss"
  notes?: string;
  address: string;
  lat: number;
  lng: number;
};

const DEMO_BOOKINGS: DemoBooking[] = [
  {
    name: 'Sarah Chen',
    email: 'sarah.chen@demo.reave.app',
    phone: '+16175550101',
    startLocal: '2026-07-15 16:00:00',
    notes: 'Site walkthrough — new deck estimate',
    address: '123 Beacon Hill Rd, Boston, MA 02108',
    lat: 42.3588,
    lng: -71.0707,
  },
  {
    name: 'Mike Rodriguez',
    email: 'mike@greenplanet.demo',
    phone: '+16175550102',
    startLocal: '2026-07-16 10:00:00',
    notes: 'Quarterly pest inspection follow-up',
    address: '45 Commonwealth Ave, Boston, MA 02116',
    lat: 42.3523,
    lng: -71.0745,
  },
  {
    name: 'Emma Foster',
    email: 'emma@phaseline.demo',
    startLocal: '2026-07-16 14:30:00',
    notes: 'Exterior repaint color consult',
    address: '88 Summer St, Boston, MA 02110',
    lat: 42.3539,
    lng: -71.0577,
  },
  {
    name: 'James Park',
    email: 'jpark@capco.demo',
    phone: '+16175550104',
    startLocal: '2026-07-17 09:00:00',
    notes: 'Kitchen remodel kickoff',
    address: '200 Boylston St, Boston, MA 02116',
    lat: 42.3522,
    lng: -71.0662,
  },
  {
    name: 'Lisa Nguyen',
    email: 'lisa@rothco.demo',
    startLocal: '2026-07-17 11:00:00',
    address: '75 State St, Boston, MA 02109',
    lat: 42.3587,
    lng: -71.0567,
  },
  {
    name: 'David Walsh',
    email: 'dwalsh@paulino.demo',
    phone: '+16175550106',
    startLocal: '2026-07-20 10:30:00',
    notes: 'Fleet wrap design review',
    address: '1 Seaport Blvd, Boston, MA 02210',
    lat: 42.3488,
    lng: -71.0418,
  },
  {
    name: 'Rachel Brooks',
    email: 'rachel@icfp.demo',
    startLocal: '2026-07-21 11:00:00',
    notes: 'Annual financial planning session',
    address: '100 Federal St, Boston, MA 02110',
    lat: 42.3545,
    lng: -71.0556,
  },
  {
    name: 'Tom Bradley',
    email: 'tom@allauto.demo',
    phone: '+16175550108',
    startLocal: '2026-07-22 10:00:00',
    address: '500 Boylston St, Boston, MA 02116',
    lat: 42.3505,
    lng: -71.0753,
  },
  {
    name: 'Nina Patel',
    email: 'nina@mavsafe.demo',
    startLocal: '2026-07-23 09:30:00',
    notes: 'Safety audit walkthrough',
    address: '28 State St, Boston, MA 02109',
    lat: 42.3589,
    lng: -71.0578,
  },
  {
    name: 'Chris O\'Brien',
    email: 'chris@selectfacility.demo',
    phone: '+16175550110',
    startLocal: '2026-07-24 13:00:00',
    notes: 'Janitorial scope review',
    address: '60 State St, Boston, MA 02109',
    lat: 42.3586,
    lng: -71.0562,
  },
];

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    const userRes = await pool.query(
      `SELECT u.id, et.id AS event_type_id, et.length, et.title
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       ORDER BY et.id
       LIMIT 1`,
      [CALCOM_USERNAME],
    );
    const user = userRes.rows[0];
    if (!user) throw new Error(`Cal.com user not found: ${CALCOM_USERNAME}`);

    const { id: userId, event_type_id: eventTypeId, length, title } = user;
    console.log(`Seeding ${DEMO_BOOKINGS.length} demo bookings for @${CALCOM_USERNAME} (${title}, ${length}m)`);

    let created = 0;
    let skipped = 0;

    for (const demo of DEMO_BOOKINGS) {
      const startDate = demo.startLocal;
      const endDate = addMinutesLocal(startDate, length);

      const conflict = await pool.query(
        `SELECT id FROM "Booking"
         WHERE "userId" = $1 AND "startTime" = $2::timestamp AND status != 'cancelled'`,
        [userId, startDate],
      );
      if (conflict.rows.length > 0) {
        console.log(`  skip ${demo.name} @ ${demo.startLocal} (slot taken)`);
        skipped++;
        continue;
      }

      const uid = crypto.randomUUID();
      const metadata = {
        geo: {
          lat: demo.lat,
          lng: demo.lng,
          resolved: demo.address,
          geocodedAt: new Date().toISOString(),
        },
        ...(demo.phone ? { phoneE164: demo.phone } : {}),
        seeded: true,
      };

      if (DRY_RUN) {
        console.log(`  [dry-run] ${demo.name} — ${demo.startLocal} — ${demo.address}`);
        created++;
        continue;
      }

      const bookingRes = await pool.query(
        `INSERT INTO "Booking"
           ("uid", "userId", "eventTypeId", "startTime", "endTime", "title", "status", "metadata", "description", "location")
         VALUES ($1, $2, $3, $4, $5, $6, 'accepted', $7, $8, $9)
         RETURNING id, uid`,
        [
          uid,
          userId,
          eventTypeId,
          startDate,
          endDate,
          title || '30 min meeting',
          JSON.stringify(metadata),
          demo.notes || null,
          demo.address,
        ],
      );
      const bookingId = bookingRes.rows[0].id;

      await pool.query(
        `INSERT INTO "Attendee" ("bookingId", "email", "name", "locale", "timeZone")
         VALUES ($1, $2, $3, 'en', $4)`,
        [bookingId, demo.email, demo.name, TIMEZONE],
      );

      console.log(`  + ${demo.name} — ${demo.startLocal} — ${uid.slice(0, 8)}`);
      created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped${DRY_RUN ? ' (dry run)' : ''}.`);
  } finally {
    await pool.end();
  }
}

/** Add minutes to a local "YYYY-MM-DD HH:mm:ss" timestamp string. */
function addMinutesLocal(local: string, minutes: number): string {
  const [datePart, timePart] = local.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, ss || 0);
  dt.setMinutes(dt.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
