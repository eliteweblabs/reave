/**
 * Seed demo Cal.com bookings for the admin schedule tab.
 *
 * Usage:
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts --dry-run
 *
 * Uses the public Railway proxy URL from .env.railway.postgres when unset.
 * Generates ~2 months of events: 2–3 on weekdays, 1–2 on weekends.
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

type DemoContact = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  address: string;
  lat: number;
  lng: number;
};

type DemoBooking = DemoContact & {
  /** Local wall-clock time in BOOKING_TIMEZONE (not UTC). */
  startLocal: string; // "YYYY-MM-DD HH:mm:ss"
};

const CONTACTS: DemoContact[] = [
  {
    name: 'Sarah Chen',
    email: 'sarah.chen@demo.reave.app',
    phone: '+16175550101',
    notes: 'Site walkthrough — new deck estimate',
    address: '123 Beacon Hill Rd, Boston, MA 02108',
    lat: 42.3588,
    lng: -71.0707,
  },
  {
    name: 'Mike Rodriguez',
    email: 'mike@greenplanet.demo',
    phone: '+16175550102',
    notes: 'Quarterly pest inspection follow-up',
    address: '45 Commonwealth Ave, Boston, MA 02116',
    lat: 42.3523,
    lng: -71.0745,
  },
  {
    name: 'Emma Foster',
    email: 'emma@phaseline.demo',
    notes: 'Exterior repaint color consult',
    address: '88 Summer St, Boston, MA 02110',
    lat: 42.3539,
    lng: -71.0577,
  },
  {
    name: 'James Park',
    email: 'jpark@capco.demo',
    phone: '+16175550104',
    notes: 'Kitchen remodel kickoff',
    address: '200 Boylston St, Boston, MA 02116',
    lat: 42.3522,
    lng: -71.0662,
  },
  {
    name: 'Lisa Nguyen',
    email: 'lisa@rothco.demo',
    address: '75 State St, Boston, MA 02109',
    lat: 42.3587,
    lng: -71.0567,
  },
  {
    name: 'David Walsh',
    email: 'dwalsh@paulino.demo',
    phone: '+16175550106',
    notes: 'Fleet wrap design review',
    address: '1 Seaport Blvd, Boston, MA 02210',
    lat: 42.3488,
    lng: -71.0418,
  },
  {
    name: 'Rachel Brooks',
    email: 'rachel@icfp.demo',
    notes: 'Annual financial planning session',
    address: '100 Federal St, Boston, MA 02110',
    lat: 42.3545,
    lng: -71.0556,
  },
  {
    name: 'Tom Bradley',
    email: 'tom@allauto.demo',
    phone: '+16175550108',
    address: '500 Boylston St, Boston, MA 02116',
    lat: 42.3505,
    lng: -71.0753,
  },
  {
    name: 'Nina Patel',
    email: 'nina@mavsafe.demo',
    notes: 'Safety audit walkthrough',
    address: '28 State St, Boston, MA 02109',
    lat: 42.3589,
    lng: -71.0578,
  },
  {
    name: 'Chris O\'Brien',
    email: 'chris@selectfacility.demo',
    phone: '+16175550110',
    notes: 'Janitorial scope review',
    address: '60 State St, Boston, MA 02109',
    lat: 42.3586,
    lng: -71.0562,
  },
  {
    name: 'Amanda Torres',
    email: 'amanda@brightline.demo',
    phone: '+16175550111',
    notes: 'Roof inspection follow-up',
    address: '350 Congress St, Boston, MA 02210',
    lat: 42.3498,
    lng: -71.0489,
  },
  {
    name: 'Kevin Liu',
    email: 'kevin@northstar.demo',
    notes: 'HVAC maintenance consult',
    address: '177 Huntington Ave, Boston, MA 02115',
    lat: 42.3431,
    lng: -71.0873,
  },
  {
    name: 'Maria Santos',
    email: 'maria@harborview.demo',
    phone: '+16175550113',
    notes: 'Landscaping proposal review',
    address: '10 Post Office Square, Boston, MA 02109',
    lat: 42.3567,
    lng: -71.0551,
  },
  {
    name: 'Brian Hayes',
    email: 'brian@apexbuild.demo',
    notes: 'Foundation repair estimate',
    address: '399 Boylston St, Boston, MA 02116',
    lat: 42.3519,
    lng: -71.0748,
  },
  {
    name: 'Olivia Grant',
    email: 'olivia@grantco.demo',
    phone: '+16175550115',
    address: '33 Arch St, Boston, MA 02110',
    lat: 42.3554,
    lng: -71.0589,
  },
];

const WEEKDAY_SLOTS = ['09:00:00', '10:30:00', '13:00:00', '14:30:00', '16:00:00'];
const WEEKEND_SLOTS = ['10:00:00', '11:30:00', '14:00:00'];

/** Simple deterministic PRNG for reproducible schedules. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pickN<T>(items: T[], n: number, rand: () => number): T[] {
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function generateDemoBookings(): DemoBooking[] {
  const rand = mulberry32(20260717);
  const bookings: DemoBooking[] = [];

  // Two months from Jul 15 through Sep 17, 2026 (includes a couple days before "today").
  const start = new Date(2026, 6, 15);
  const end = new Date(2026, 8, 17);
  let contactIdx = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    const slotPool = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
    const count = isWeekend
      ? 1 + Math.floor(rand() * 2) // 1–2
      : 2 + Math.floor(rand() * 2); // 2–3

    const times = pickN(slotPool, count, rand).sort();
    for (const time of times) {
      const contact = CONTACTS[contactIdx % CONTACTS.length];
      contactIdx += 1;
      bookings.push({
        ...contact,
        startLocal: `${dateKey(d)} ${time}`,
      });
    }
  }

  return bookings;
}

const DEMO_BOOKINGS = generateDemoBookings();

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
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
