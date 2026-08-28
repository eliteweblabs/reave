/**
 * Seed demo Cal.com bookings for the admin schedule tab.
 *
 * Usage:
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts --dry-run
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts --fresh
 *   CALCOM_DATABASE_URL="postgresql://..." npx tsx scripts/seed-bookings.ts --fresh --from-contacts
 *
 * Uses the public Railway proxy URL from .env.railway.postgres when unset.
 * Generates ~2 months of events around today: 2–3 on weekdays, 1–2 on weekends.
 * --from-contacts reads CONTACT_API_BASE_URL / CONTACT_API_KEY and books people
 * already marked Client (professional) in the book — not Proposed / Service /
 * Personal. Titles are prefixed [Demo]; metadata.seeded + metadata.demo.
 *
 * Cal.com stores startTime/endTime as UTC in timestamp-without-tz columns. Pass
 * --fresh to delete prior seeded rows before inserting (needed after fixing TZ).
 */

import crypto from 'node:crypto';
import pg from 'pg';
import { isDemoContactEmail } from './demo-data.ts';
import { getDemoIndustryFixtures } from './demo-industries/index.ts';

const { Pool } = pg;

function parseCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith('-')) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const FRESH = process.argv.includes('--fresh');
const FROM_CONTACTS = process.argv.includes('--from-contacts');
const INDUSTRY = parseCliArg('--industry') || process.env.DEMO_INDUSTRY || 'general';

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

const FIXTURE_CONTACTS: DemoContact[] = getDemoIndustryFixtures(INDUSTRY).contacts.map((c) => ({
  name: c.name,
  email: c.email,
  phone: c.phone,
  notes: (c.notes || '').replace(/^\[demo-seed\]\s*/i, '') || c.company || c.name,
  address: c.address || 'Boston, MA',
  lat: c.lat ?? 42.3601,
  lng: c.lng ?? -71.0589,
}));

const FALLBACK_CONTACTS: DemoContact[] = [
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

const DEFAULT_CONTACTS = FIXTURE_CONTACTS.length ? FIXTURE_CONTACTS : FALLBACK_CONTACTS;
const DEFAULT_ADDRESS = 'Beverly, MA 01915';
const DEFAULT_LAT = 42.5584;
const DEFAULT_LNG = -70.8801;
const DEMO_NOTES = [
  'Demo — onboarding check-in',
  'Demo — module walkthrough',
  'Demo — website review',
  'Demo — punch list sync',
  'Demo — deploy recap',
];
const SERVICE_EMAIL_LOCAL = /^(no-?reply|no_reply|mailer-daemon|notifications|donotreply|auto-confirm|workspace-noreply|businessprofile-noreply|appleid)\b/i;
const SERVICE_EMAIL_DOMAINS = new Set([
  'ebay.com',
  'google.com',
  'apple.com',
  'github.com',
  'railway.app',
  'cursor.com',
  'redditmail.com',
  'amazon.com',
  'upwork.com',
  'telnyx.com',
  'uptimerobot.com',
  'robinhood.com',
  'kinsta.com',
  'id.apple.com',
  'email.apple.com',
  'accounts.google.com',
  'information.flexcar.com',
  'notify.railway.app',
  'mail.cursor.com',
  't.upwork.com',
  'petdesk.com',
]);
const JUNK_NAME =
  /^(©|\(c\)|hi thomas|it's called|what is|show me|call |we're here|zzz |drop count)/i;
const SERVICE_NAMES = new Set([
  'flexcar',
  'ebay',
  'reddit',
  'apple',
  'appleid',
  'github notifications',
  'amazon shipping?',
  'cursor',
  'uptime robot',
  'telnyx discover',
  'telnyx campaigns',
  'telnyx portal',
  'upwork',
  'google',
  'google workspace',
  'anthropic',
  'railway',
]);

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

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function isServiceEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const local = e.split('@')[0] || '';
  if (SERVICE_EMAIL_LOCAL.test(local)) return true;
  return SERVICE_EMAIL_DOMAINS.has(emailDomain(e));
}

function skipAutoContact(name: string, email: string): boolean {
  const n = name.trim().toLowerCase();
  const e = email.trim().toLowerCase();
  if (!n) return true;
  if (n === 'noreply' || n === 'no reply' || n === 'mailer-daemon' || n === 'thomas senecal') {
    return true;
  }
  if (JUNK_NAME.test(name.trim()) || SERVICE_NAMES.has(n)) return true;
  if (name.trim().length > 70 || name.trim().split(/\s+/).length > 8) return true;
  if (e && isDemoContactEmail(e)) return true;
  if (e && isServiceEmail(e)) return true;
  return false;
}

async function contactIsBookedClient(
  base: string,
  key: string,
  uid: string,
): Promise<boolean> {
  if (!uid.trim()) return false;
  const res = await fetch(`${base}/api/contacts/${encodeURIComponent(uid)}/links`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      'X-API-Key': key,
    },
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { links?: Array<{ system?: string; metadata?: { clientKind?: string; personal?: boolean } }> };
  const portal = (json.links ?? []).find((l) => l.system === 'portal');
  const kind = String(portal?.metadata?.clientKind ?? '').trim().toLowerCase();
  return kind === 'professional';
}

function demoEmailFor(name: string, email: string): string {
  const trimmed = email.trim();
  if (trimmed) return trimmed;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'client';
  return `demo.${slug}@demo.reave.app`;
}

async function fetchContactsFromApi(skipEmails: Set<string>): Promise<DemoContact[]> {
  const base = process.env.CONTACT_API_BASE_URL?.trim()?.replace(/\/+$/, '');
  const key = process.env.CONTACT_API_KEY?.trim();
  if (!base || !key) {
    throw new Error('--from-contacts requires CONTACT_API_BASE_URL and CONTACT_API_KEY');
  }

  const out: DemoContact[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(`${base}/api/contacts?${params}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        'X-API-Key': key,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`list contacts: HTTP ${res.status} ${text.slice(0, 180)}`);
    const json = text ? (JSON.parse(text) as { contacts?: Array<Record<string, unknown>> }) : {};
    const batch = json.contacts ?? [];
    for (const raw of batch) {
      const name = String(raw.name ?? '').trim();
      const rawEmail = String(raw.email ?? '').trim();
      const uid = String(raw.uid ?? '').trim();
      if (skipAutoContact(name, rawEmail)) continue;
      if (rawEmail && skipEmails.has(rawEmail.toLowerCase())) continue;
      if (!(await contactIsBookedClient(base, key, uid))) continue;
      const email = demoEmailFor(name, rawEmail);
      const phone = String(raw.phone ?? '').trim() || undefined;
      const address =
        String(raw.address ?? '').trim() ||
        String((raw.notes as string | undefined) ?? '').match(
          /\d.+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)[^,]*,\s*[A-Z]{2}\b.*/i,
        )?.[0] ||
        DEFAULT_ADDRESS;
      const lat = typeof raw.lat === 'number' ? raw.lat : DEFAULT_LAT;
      const lng = typeof raw.lng === 'number' ? raw.lng : DEFAULT_LNG;
      out.push({
        name,
        email,
        phone,
        notes: DEMO_NOTES[out.length % DEMO_NOTES.length],
        address,
        lat,
        lng,
      });
    }
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }
  if (!out.length) {
    throw new Error('--from-contacts found no Client-kind contacts (Proposed / Service / Personal skipped)');
  }
  return out;
}

function generateDemoBookings(contacts: DemoContact[]): DemoBooking[] {
  const rand = mulberry32(20260717);
  const bookings: DemoBooking[] = [];

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 45);
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
      const contact = contacts[contactIdx % contacts.length];
      contactIdx += 1;
      bookings.push({
        ...contact,
        notes: DEMO_NOTES[bookings.length % DEMO_NOTES.length],
        startLocal: `${dateKey(d)} ${time}`,
      });
    }
  }

  return bookings;
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    const userRes = await pool.query(
      `SELECT u.id, u.email, et.id AS event_type_id, et.length, et.title
       FROM users u
       JOIN "EventType" et ON et."userId" = u.id
       WHERE u.username = $1
       ORDER BY et.id
       LIMIT 1`,
      [CALCOM_USERNAME],
    );
    const user = userRes.rows[0];
    if (!user) throw new Error(`Cal.com user not found: ${CALCOM_USERNAME}`);

    const { id: userId, event_type_id: eventTypeId, length, title, email: ownerEmail } = user;

    const skipEmails = new Set<string>();
    if (typeof ownerEmail === 'string' && ownerEmail.trim()) {
      skipEmails.add(ownerEmail.trim().toLowerCase());
    }

    const contacts = FROM_CONTACTS
      ? await fetchContactsFromApi(skipEmails)
      : DEFAULT_CONTACTS;
    const DEMO_BOOKINGS = generateDemoBookings(contacts);
    const source = FROM_CONTACTS
      ? `${contacts.length} contact-api people (sample)`
      : `${contacts.length} fixture contacts`;
    console.log(
      `Seeding ${DEMO_BOOKINGS.length} sample bookings for @${CALCOM_USERNAME} (${title}, ${length}m) from ${source}`,
    );

    if (FRESH && !DRY_RUN) {
      const del = await pool.query(
        `DELETE FROM "Booking" WHERE metadata->>'seeded' = 'true' RETURNING id`,
      );
      console.log(`Removed ${del.rowCount ?? 0} prior seeded booking(s).`);
    }

    let created = 0;
    let skipped = 0;
    let dryRunSamples = 0;

    for (const demo of DEMO_BOOKINGS) {
      const startDate = localWallClockToUtcTimestamp(demo.startLocal, TIMEZONE);
      const endDate = addMinutesUtc(startDate, length);

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
        sample: true,
        demo: true,
      };
      const sampleTitle = `[Demo] Meeting with ${demo.name}`;
      const sampleNotes = `[demo-seed] ${demo.notes || 'Demo appointment'}`;

      if (DRY_RUN) {
        if (dryRunSamples < 3) {
          console.log(`  ${demo.startLocal} ${TIMEZONE} -> ${startDate} UTC`);
          dryRunSamples++;
        }
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
          sampleTitle || title || '30 min meeting',
          JSON.stringify(metadata),
          sampleNotes,
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

/**
 * Convert BOOKING_TIMEZONE wall clock to the UTC timestamp string Cal.com expects
 * in its timestamp-without-tz columns (read back as UTC by node-pg / the booking API).
 */
function localWallClockToUtcTimestamp(local: string, timeZone: string): string {
  const [datePart, timePart] = local.split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, se = 0] = timePart.split(':').map(Number);

  let utcMs = Date.UTC(y, mo - 1, d, h, mi, se);
  for (let i = 0; i < 4; i++) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    utcMs += Date.UTC(y, mo - 1, d, h, mi, se) - shown;
  }

  const dt = new Date(utcMs);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}

/** Add minutes to a UTC "YYYY-MM-DD HH:mm:ss" timestamp string. */
function addMinutesUtc(utcLocal: string, minutes: number): string {
  const dt = new Date(`${utcLocal.replace(' ', 'T')}Z`);
  dt.setUTCMinutes(dt.getUTCMinutes() + minutes);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
