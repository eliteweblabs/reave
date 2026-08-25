/**
 * Seed the admin dashboard with realistic demo data for client presentations.
 *
 * Creates fake contacts (@demo.reave.app / *.demo), projects, emails, chats,
 * todos, and engagement events. Also ensures one **real** contact (your email)
 * so you can open the client portal on your phone and receive test messages.
 *
 * Usage:
 *   npm run seed:demo
 *   npm run seed:demo -- --dry-run
 *   npm run seed:demo -- --fresh          # remove prior demo rows first
 *   npm run seed:demo -- --with-bookings  # also run scripts/seed-bookings.ts
 *   npm run seed:demo -- --push           # send a test push after seeding (phone must be subscribed)
 *
 * Required env (loads `.env` from repo root when present):
 *   DATABASE_URL              — app Postgres (chats, jobs, email inbox, todos, …)
 *   CONTACT_API_BASE_URL      — contact-api HTTP base
 *   CONTACT_API_KEY           — contact-api auth
 *   AGENT_ALERT_USER_ID       — your Clerk user id (demo chats attach to this account)
 *
 * Real contact (kept on --fresh):
 *   DEMO_REAL_CONTACT_EMAIL   — your real email (required for the real contact)
 *   DEMO_REAL_CONTACT_NAME    — display name (default: ADMIN_USERNAME or "Demo Client")
 *   DEMO_REAL_CONTACT_PHONE   — optional phone for portal / CardDAV demos
 *
 * Optional:
 *   DEMO_REAL_JOB_TITLE       — active project for the real contact (default: "Website refresh")
 *   DEMO_FORCE_COMPANY=1      — overwrite company_config branding with demo values
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import {
  DEMO_SEED_MARKER,
  isDemoContactEmail,
  type DemoContactDef,
} from './demo-data.ts';
import { getDemoIndustryFixtures, type DemoIndustryFixtures } from './demo-industries/index.ts';

const { Pool } = pg;

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = join(ROOT, '..');

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
const WITH_BOOKINGS_FLAG = process.argv.includes('--with-bookings');
const SEND_PUSH = process.argv.includes('--push');
const FORCE_COMPANY = process.argv.includes('--force-company') || process.env.DEMO_FORCE_COMPANY === '1';
const SKIP_INBOX =
  process.argv.includes('--no-inbox') || process.env.SEED_INBOX === '0' || process.env.SEED_INBOX === 'false';
const SKIP_TODOS =
  process.argv.includes('--no-todos') || process.env.SEED_TODOS === '0' || process.env.SEED_TODOS === 'false';
const SKIP_SCHEDULE =
  process.argv.includes('--no-schedule') || process.env.SEED_SCHEDULE === '0' || process.env.SEED_SCHEDULE === 'false';

loadDotEnv();

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const DEMO_INDUSTRY = parseCliArg('--industry') ?? env('DEMO_INDUSTRY') ?? 'general';
const DEMO_MODULE_IDS = (parseCliArg('--module-ids') ?? env('DEMO_MODULE_IDS') ?? '')
  .split(/[,|\s]+/)
  .map((s) => s.trim().padStart(3, '0'))
  .filter(Boolean);
const DEMO_TIER = parseCliArg('--tier') ?? env('DEMO_TIER') ?? '1';

const FIXTURES: DemoIndustryFixtures = getDemoIndustryFixtures(DEMO_INDUSTRY);
const DEMO_CONTACTS = FIXTURES.contacts;
const DEMO_JOBS = FIXTURES.jobs;
const DEMO_EMAILS = FIXTURES.emails;
const DEMO_CHATS = FIXTURES.chats;
const DEMO_TODOS = FIXTURES.todos;
const DEMO_ENGAGEMENT = FIXTURES.engagement;
const DEMO_JOB_COMMENTS = FIXTURES.jobComments;

function hasDemoModule(id: string): boolean {
  if (!DEMO_MODULE_IDS.length) return true;
  return DEMO_MODULE_IDS.includes(id.padStart(3, '0'));
}

/** Scheduling module id 012 — auto-enable bookings seed when in suite. */
const WITH_BOOKINGS =
  !SKIP_SCHEDULE &&
  (WITH_BOOKINGS_FLAG || (hasDemoModule('012') && Boolean(env('CALCOM_DATABASE_URL'))));

type ContactRecord = {
  uid: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
};

type SeededContact = ContactRecord & { key: string };

function loadDotEnv(): void {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function log(msg: string): void {
  console.log(DRY_RUN ? `[dry-run] ${msg}` : msg);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysFromNowDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function contactApiBase(): string | null {
  const raw = env('CONTACT_API_BASE_URL');
  return raw ? raw.replace(/\/+$/, '') : null;
}

function contactAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = env('CONTACT_API_KEY');
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function contactFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const base = contactApiBase();
  if (!base) return { ok: false, error: 'CONTACT_API_BASE_URL is not set' };
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...contactAuthHeaders(), ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : text.slice(0, 300) || res.statusText;
      return { ok: false, error: err, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function listAllContacts(): Promise<ContactRecord[]> {
  const out: ContactRecord[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await contactFetch<{ total?: number; contacts?: ContactRecord[] }>(
      `/api/contacts?${params}`,
    );
    if (!res.ok) throw new Error(`list contacts: ${res.error}`);
    const batch = res.data.contacts ?? [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }
  return out;
}

async function createContact(input: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}): Promise<ContactRecord> {
  const res = await contactFetch<{ contact?: ContactRecord } | ContactRecord>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      company: input.company?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    }),
  });
  if (!res.ok) throw new Error(`create contact ${input.name}: ${res.error}`);
  const contact =
    res.data && typeof res.data === 'object' && 'contact' in res.data
      ? (res.data as { contact: ContactRecord }).contact
      : (res.data as ContactRecord);
  if (!contact?.uid) throw new Error(`create contact ${input.name}: unexpected response`);
  return contact;
}

async function setContactPortal(
  uid: string,
  portal: Record<string, unknown>,
): Promise<void> {
  const res = await contactFetch(`/api/contacts/${encodeURIComponent(uid)}/link`, {
    method: 'POST',
    body: JSON.stringify({
      system: 'portal',
      externalId: uid,
      metadata: { ...portal, enabled: true, updatedAt: new Date().toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`set portal for ${uid}: ${res.error}`);
}

async function deleteContact(uid: string): Promise<void> {
  const res = await contactFetch(`/api/contacts/${encodeURIComponent(uid)}?permanent=true`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`delete contact ${uid}: ${res.error}`);
}

async function findContactByEmail(email: string): Promise<ContactRecord | null> {
  const q = email.trim().toLowerCase();
  const all = await listAllContacts();
  return all.find((c) => (c.email ?? '').trim().toLowerCase() === q) ?? null;
}

async function ensureJobSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      client VARCHAR(255) NOT NULL,
      client_uid VARCHAR(255),
      status VARCHAR(50) DEFAULT 'inquiry',
      priority VARCHAR(50) DEFAULT 'normal',
      due_date DATE,
      value NUMERIC(12,2),
      tags TEXT[] DEFAULT '{}',
      source VARCHAR(100) DEFAULT '',
      source_chat_id TEXT,
      body TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS job_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_slug VARCHAR(255) NOT NULL,
      author VARCHAR(20) NOT NULL,
      author_name VARCHAR(255) NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS job_time_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_slug VARCHAR(255) NOT NULL,
      hours NUMERIC(8,2) NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function ensureChatSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensureEmailSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_inbox (
      id UUID PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_address TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body_snippet TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'UNMATCHED',
      action TEXT NOT NULL DEFAULT 'classified',
      notified BOOLEAN NOT NULL DEFAULT false
    );
  `);
  const cols = [
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'review'`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_uid TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_name TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_slug TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_title TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS route_note TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS scheduling_note TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_text TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS to_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS cc_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS bcc_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS reply_to_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS headers_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS message_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS resend_email_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_kind TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS verification_code TEXT`,
    `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS delete_after_at TIMESTAMPTZ`,
  ];
  for (const sql of cols) await pool.query(sql);
}

async function ensureTodoSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      due_date TIMESTAMPTZ,
      priority VARCHAR(50) NOT NULL DEFAULT 'normal',
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sort_order INT NOT NULL DEFAULT 0,
      job_slug VARCHAR(255),
      assignee VARCHAR(255),
      section VARCHAR(255)
    );
  `);
}

async function ensureEngagementSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engagement_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      staff_ack_at TIMESTAMPTZ,
      contact_uid TEXT,
      contact_name TEXT,
      job_slug TEXT,
      job_title TEXT,
      dedupe_key TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_dedupe_uidx
      ON engagement_events (type, dedupe_key)
      WHERE dedupe_key IS NOT NULL;
  `);
}

async function ensureCompanySchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_config (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      name TEXT,
      domain TEXT,
      support_email TEXT,
      address TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO company_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    ALTER TABLE company_config ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE company_config ADD COLUMN IF NOT EXISTS support_phone TEXT;
    ALTER TABLE company_config ADD COLUMN IF NOT EXISTS og_data TEXT;
    ALTER TABLE company_config ADD COLUMN IF NOT EXISTS og_media_type TEXT;
  `);
}

async function freshDemoData(pool: pg.Pool): Promise<void> {
  log('Removing prior demo rows…');
  if (DRY_RUN) return;

  await pool.query(
    `DELETE FROM job_time_entries WHERE job_slug IN (SELECT slug FROM jobs WHERE source = 'demo')`,
  );
  await pool.query(
    `DELETE FROM job_comments WHERE job_slug IN (SELECT slug FROM jobs WHERE source = 'demo')`,
  );
  await pool.query(`DELETE FROM jobs WHERE source = 'demo'`);
  await pool.query(`DELETE FROM email_inbox WHERE resend_email_id LIKE 'demo-%'`);
  await pool.query(
    `DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE title LIKE '[Demo]%')`,
  );
  await pool.query(`DELETE FROM chat_threads WHERE title LIKE '[Demo]%'`);
  await pool.query(`DELETE FROM todos WHERE section LIKE '[Demo]%'`);
  await pool.query(`DELETE FROM engagement_events WHERE dedupe_key LIKE 'demo:%'`);

  if (contactApiBase()) {
    const contacts = await listAllContacts();
    for (const c of contacts) {
      const notes = c.notes ?? '';
      if (isDemoContactEmail(c.email) || notes.includes(DEMO_SEED_MARKER)) {
        log(`  delete contact ${c.name} (${c.email ?? c.uid})`);
        await deleteContact(c.uid);
      }
    }
  }
}

async function seedCompanyConfig(pool: pg.Pool): Promise<void> {
  await ensureCompanySchema(pool);
  const { rows } = await pool.query<{ name: string | null }>(
    'SELECT name FROM company_config WHERE id = 1',
  );
  const currentName = rows[0]?.name?.trim() ?? '';
  if (currentName && !FORCE_COMPANY) {
    log(`Company config already set (${currentName}) — skipping (use --force-company to overwrite)`);
    return;
  }

  log('Seeding company config…');
  if (DRY_RUN) return;

  await pool.query(
    `UPDATE company_config SET
      name = $1,
      description = $2,
      domain = $3,
      support_email = $4,
      support_phone = $5,
      address = $6,
      brand_primary = $7,
      brand_secondary = $8,
      updated_at = now()
     WHERE id = 1`,
    [
      FIXTURES.company.name,
      FIXTURES.company.description,
      env('PUBLIC_SITE_DOMAIN') ?? 'demo.reave.app',
      FIXTURES.company.supportEmail ?? env('DEMO_REAL_CONTACT_EMAIL') ?? 'hello@demo.reave.app',
      '+1 (617) 555-0100',
      '177 Huntington Ave, Boston, MA 02115',
      FIXTURES.company.brandPrimary ?? null,
      FIXTURES.company.brandSecondary ?? null,
    ],
  );
}

async function seedDemoContact(
  def: DemoContactDef,
): Promise<SeededContact> {
  const existing = await findContactByEmail(def.email);
  if (existing) {
    log(`  contact exists: ${def.name} (${def.email})`);
    return { ...existing, key: def.key };
  }

  log(`  create contact: ${def.name} (${def.email})`);
  if (DRY_RUN) {
    return { uid: `dry-${def.key}`, name: def.name, email: def.email, key: def.key };
  }

  const created = await createContact({
    name: def.name,
    email: def.email,
    phone: def.phone,
    company: def.company,
    notes: def.notes,
  });

  if (def.portal || def.address) {
    await setContactPortal(created.uid, {
      ...(def.portal ?? {}),
      address: def.address,
      geo:
        def.lat != null && def.lng != null
          ? { lat: def.lat, lng: def.lng, geocodedAt: new Date().toISOString() }
          : undefined,
    });
  }

  return { ...created, key: def.key };
}

async function seedRealContact(): Promise<SeededContact | null> {
  const email = env('DEMO_REAL_CONTACT_EMAIL');
  if (!email) {
    console.warn(
      '⚠ DEMO_REAL_CONTACT_EMAIL is not set — skipping the real contact. Set it to your email so you can demo the client portal on your phone.',
    );
    return null;
  }

  const name =
    env('DEMO_REAL_CONTACT_NAME') ??
    env('ADMIN_USERNAME')?.split(',')[0]?.trim() ??
    'Demo Client';
  const phone = env('DEMO_REAL_CONTACT_PHONE');
  const existing = await findContactByEmail(email);

  if (existing) {
    log(`Real contact already exists: ${existing.name} (${email})`);
    return { ...existing, key: 'real' };
  }

  log(`Creating real contact: ${name} (${email})`);
  if (DRY_RUN) {
    return { uid: 'dry-real', name, email, key: 'real' };
  }

  const created = await createContact({
    name,
    email,
    phone,
    company: name,
    notes: 'Your real contact for live demos — not removed by --fresh.',
  });

  await setContactPortal(created.uid, {
    headline: 'Your project hub',
    body: 'This is your live client portal. Bookmark this page to demo on your phone during sales calls.',
    enabled: true,
  });

  return { ...created, key: 'real' };
}

async function seedContacts(): Promise<Map<string, SeededContact>> {
  if (!contactApiBase()) {
    throw new Error('CONTACT_API_BASE_URL is required to seed contacts');
  }

  log('Seeding contacts…');
  const map = new Map<string, SeededContact>();

  for (const def of DEMO_CONTACTS) {
    const contact = await seedDemoContact(def);
    map.set(def.key, contact);
  }

  const real = await seedRealContact();
  if (real) map.set('real', real);

  return map;
}

async function seedJobs(pool: pg.Pool, contacts: Map<string, SeededContact>): Promise<void> {
  await ensureJobSchema(pool);
  log(`Seeding ${DEMO_JOBS.length} demo projects…`);

  for (const job of DEMO_JOBS) {
    const contact = contacts.get(job.contactKey);
    if (!contact) {
      console.warn(`  skip job ${job.slug}: unknown contact key ${job.contactKey}`);
      continue;
    }

    log(`  job: ${job.title}`);
    if (DRY_RUN) continue;

    await pool.query(
      `INSERT INTO jobs (slug, title, client, client_uid, status, priority, due_date, value, tags, source, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'demo', $10)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         client = EXCLUDED.client,
         client_uid = EXCLUDED.client_uid,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         due_date = EXCLUDED.due_date,
         value = EXCLUDED.value,
         tags = EXCLUDED.tags,
         source = 'demo',
         body = EXCLUDED.body,
         updated_at = now()`,
      [
        job.slug,
        job.title,
        contact.name,
        contact.uid,
        job.status,
        job.priority,
        job.dueDate ?? null,
        job.value ?? null,
        job.tags ?? [],
        job.body,
      ],
    );
  }

  const real = contacts.get('real');
  if (real) {
    const slug = 'demo-real-website';
    const title = env('DEMO_REAL_JOB_TITLE') ?? 'Website refresh';
    log(`  job (real): ${title}`);
    if (!DRY_RUN) {
      await pool.query(
        `INSERT INTO jobs (slug, title, client, client_uid, status, priority, due_date, source, body)
         VALUES ($1, $2, $3, $4, 'active', 'normal', $5, 'demo', $6)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           client = EXCLUDED.client,
           client_uid = EXCLUDED.client_uid,
           updated_at = now()`,
        [
          slug,
          title,
          real.name,
          real.uid,
          daysFromNowDate(21),
          'Live demo project linked to your real contact. Safe to show clients on your phone.',
        ],
      );
    }
  }
}

async function seedJobComments(pool: pg.Pool): Promise<void> {
  log(`Seeding ${DEMO_JOB_COMMENTS.length} project comments…`);
  for (const c of DEMO_JOB_COMMENTS) {
    if (DRY_RUN) continue;
    await pool.query(
      `INSERT INTO job_comments (job_slug, author, author_name, body, created_at)
       SELECT $1, $2, $3, $4, $5
       WHERE EXISTS (SELECT 1 FROM jobs WHERE slug = $1)
       AND NOT EXISTS (
         SELECT 1 FROM job_comments
         WHERE job_slug = $1 AND body = $4 AND author = $2
       )`,
      [c.jobSlug, c.author, c.authorName, c.body, daysAgoIso(c.daysAgo ?? 0)],
    );
  }
}

/** Remember this install started without RESEND_API_KEY so a later first set can wipe seed mail. */
async function markEmailApiUnset(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_triage_config (
      id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      notify_on_unmatched BOOLEAN NOT NULL DEFAULT true,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO email_triage_config (id, notify_on_unmatched) VALUES (1, true)
      ON CONFLICT (id) DO NOTHING;
    ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS email_api_seen BOOLEAN;
    UPDATE email_triage_config
       SET email_api_seen = false, updated_at = now()
     WHERE id = 1 AND email_api_seen IS DISTINCT FROM TRUE
  `);
}

async function seedEmails(pool: pg.Pool, contacts: Map<string, SeededContact>): Promise<void> {
  await ensureEmailSchema(pool);
  log(`Seeding ${DEMO_EMAILS.length} inbox messages…`);

  for (const email of DEMO_EMAILS) {
    const contact = email.contactKey ? contacts.get(email.contactKey) : undefined;
    const jobTitle = email.jobSlug
      ? DEMO_JOBS.find((j) => j.slug === email.jobSlug)?.title ?? null
      : null;

    log(`  email: ${email.subject}`);
    if (DRY_RUN) continue;

    await pool.query(
      `INSERT INTO email_inbox
        (id, received_at, from_address, subject, body_snippet, body_text, body_html,
         to_addrs, cc_addrs, bcc_addrs, reply_to_addrs, headers_json, message_id, resend_email_id,
         attachments_json, status, action, notified, summary, category,
         contact_uid, contact_name, job_slug, job_title, route_note, scheduling_note)
       VALUES ($1, $2, $3, $4, $5, $6, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
               $7, $8, '[]'::jsonb, $9, $10, false, $11, $12, $13, $14, $15, $16, '', '')
       ON CONFLICT (id) DO NOTHING`,
      [
        email.id,
        daysAgoIso(email.daysAgo ?? 0),
        email.from,
        email.subject,
        email.bodySnippet,
        email.bodyText,
        `demo-msg-${email.id}`,
        `demo-${email.id}`,
        email.status,
        email.action,
        email.summary ?? email.bodySnippet,
        email.category,
        contact?.uid ?? null,
        contact?.name ?? null,
        email.jobSlug ?? null,
        jobTitle,
      ],
    );
  }
}

async function seedChats(pool: pg.Pool): Promise<void> {
  const userId = env('AGENT_ALERT_USER_ID');
  if (!userId) {
    console.warn(
      '⚠ AGENT_ALERT_USER_ID is not set — skipping demo chats. Set it to your Clerk user id so threads appear when you sign in.',
    );
    return;
  }

  await ensureChatSchema(pool);
  log(`Seeding ${DEMO_CHATS.length} chat threads for ${userId}…`);

  for (const chat of DEMO_CHATS) {
    log(`  chat: ${chat.title}`);
    if (DRY_RUN) continue;

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM chat_threads WHERE user_id = $1 AND title = $2 LIMIT 1`,
      [userId, chat.title],
    );
    let threadId = existing.rows[0]?.id;
    if (!threadId) {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO chat_threads (user_id, title, updated_at)
         VALUES ($1, $2, now()) RETURNING id`,
        [userId, chat.title],
      );
      threadId = inserted.rows[0]?.id;
    }
    if (!threadId) continue;

    const { rows: countRows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM chat_messages WHERE thread_id = $1`,
      [threadId],
    );
    if ((countRows[0]?.n ?? 0) > 0) continue;

    for (const msg of chat.messages) {
      await pool.query(
        `INSERT INTO chat_messages (thread_id, role, content) VALUES ($1, $2, $3)`,
        [threadId, msg.role, msg.content],
      );
    }
    await pool.query(`UPDATE chat_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  }
}

async function seedTodos(pool: pg.Pool): Promise<void> {
  await ensureTodoSchema(pool);
  log(`Seeding ${DEMO_TODOS.length} todos…`);

  for (let i = 0; i < DEMO_TODOS.length; i++) {
    const todo = DEMO_TODOS[i];
    log(`  todo: ${todo.title}`);
    if (DRY_RUN) continue;

    const due =
      todo.daysUntilDue != null
        ? new Date(Date.now() + todo.daysUntilDue * 86400000).toISOString()
        : null;

    await pool.query(
      `INSERT INTO todos (title, section, priority, status, job_slug, sort_order, due_date)
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE NOT EXISTS (SELECT 1 FROM todos WHERE title = $1 AND section = $2)`,
      [
        todo.title,
        todo.section,
        todo.priority ?? 'normal',
        todo.status ?? 'open',
        todo.jobSlug ?? null,
        i,
        due,
      ],
    );
  }
}

async function seedEngagement(pool: pg.Pool, contacts: Map<string, SeededContact>): Promise<void> {
  await ensureEngagementSchema(pool);
  log(`Seeding ${DEMO_ENGAGEMENT.length} engagement events…`);

  for (const ev of DEMO_ENGAGEMENT) {
    log(`  event: ${ev.title}`);
    if (DRY_RUN) continue;

    const contact = ev.contactKey ? contacts.get(ev.contactKey) : undefined;
    const jobTitle = ev.jobSlug
      ? DEMO_JOBS.find((j) => j.slug === ev.jobSlug)?.title ?? null
      : null;

    await pool.query(
      `INSERT INTO engagement_events
        (id, type, title, detail, created_at, contact_uid, contact_name, job_slug, job_title, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (type, dedupe_key) WHERE (dedupe_key IS NOT NULL) DO NOTHING`,
      [
        randomUUID(),
        ev.type,
        ev.title,
        ev.detail,
        daysAgoIso(ev.daysAgo ?? 0),
        contact?.uid ?? null,
        contact?.name ?? null,
        ev.jobSlug ?? null,
        jobTitle,
        ev.dedupeKey,
      ],
    );
  }
}

function runBookingsSeed(): void {
  log('Running Cal.com booking seed…');
  if (DRY_RUN) return;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/ts-extensionless-resolve.mjs',
      '--experimental-strip-types',
      'scripts/seed-bookings.ts',
      '--industry',
      DEMO_INDUSTRY,
      ...(FRESH ? ['--fresh'] : []),
    ],
    { cwd: REPO_ROOT, stdio: 'inherit', env: process.env },
  );
  if (result.status !== 0) {
    throw new Error('seed-bookings.ts failed');
  }
}

async function sendDemoPush(): Promise<void> {
  log('Sending demo push notification…');
  if (DRY_RUN) return;

  const { isPushConfigured, sendPushNotification } = await import('../src/lib/webPush.ts');
  if (!isPushConfigured()) {
    console.warn('⚠ VAPID keys not set — skipping push (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)');
    return;
  }

  const { listPushSubscriptions } = await import('../src/lib/pushSubscriptionStore.ts');
  const subs = await listPushSubscriptions();
  if (!subs.length) {
    console.warn(
      '⚠ No push subscriptions yet. On your phone: open /admin → install to home screen (iOS) → Enable notifications.',
    );
    return;
  }

  await sendPushNotification({
    title: 'Demo environment ready',
    body:
      FIXTURES.industry === 'plumbing'
        ? 'Sarah Chen asked about the water heater install — tap to open the inbox.'
        : 'Sarah Chen replied about the deck railing — tap to open the inbox.',
    tag: 'demo-seed',
    url:
      FIXTURES.industry === 'plumbing'
        ? '/admin?tab=email&email=demo-email-sarah-heater'
        : '/admin?tab=email&email=demo-email-sarah-reply',
    badgeCount: 4,
  });
  log(`Push sent to ${subs.length} device(s). Lock your phone to see it.`);
}

function printSummary(contacts: Map<string, SeededContact>): void {
  console.log('\n── Demo seed summary ──');
  console.log(`Industry: ${FIXTURES.industry}${DEMO_MODULE_IDS.length ? ` · modules: ${DEMO_MODULE_IDS.join(',')}` : ''}${DEMO_TIER ? ` · tier: ${DEMO_TIER}` : ''}`);
  console.log(`Fake contacts: ${DEMO_CONTACTS.length}`);
  console.log(`Projects: ${DEMO_JOBS.length}${contacts.has('real') ? ' + 1 real' : ''}`);
  console.log(`Inbox: ${DEMO_EMAILS.length} · Chats: ${DEMO_CHATS.length} · Todos: ${DEMO_TODOS.length}`);

  const real = contacts.get('real');
  if (real?.uid && !DRY_RUN) {
    const origin = env('PUBLIC_SITE_DOMAIN')
      ? `https://${env('PUBLIC_SITE_DOMAIN')!.replace(/^https?:\/\//, '')}`
      : 'https://your-domain';
    console.log(`\nReal client portal: ${origin}/c/${encodeURIComponent(real.uid)}`);
    console.log(`Real contact email: ${real.email ?? '(none)'}`);
  }

  if (!env('AGENT_ALERT_USER_ID')) {
    console.log('\nSign in with Clerk, then set AGENT_ALERT_USER_ID to your user id for demo chats.');
  } else {
    console.log(`\nDemo chats are attached to Clerk user ${env('AGENT_ALERT_USER_ID')}.`);
  }

  console.log('\nRe-run with --fresh to wipe demo rows and re-seed.');
}

function printDryRunPlan(): void {
  log('Dry run — no database or API writes.');
  log(`Would seed company config${FORCE_COMPANY ? ' (force overwrite)' : ' (if empty)'}`);
  log(`Would seed ${DEMO_CONTACTS.length} fake contacts via contact-api`);
  if (env('DEMO_REAL_CONTACT_EMAIL')) {
    log(`Would ensure real contact: ${env('DEMO_REAL_CONTACT_NAME') ?? 'Demo Client'} <${env('DEMO_REAL_CONTACT_EMAIL')}>`);
  } else {
    console.warn('⚠ DEMO_REAL_CONTACT_EMAIL is not set — no real contact would be created.');
  }
  log(`Would seed ${DEMO_JOBS.length} demo projects (+ 1 real if configured)`);
  log(`Would seed ${DEMO_JOB_COMMENTS.length} project comments`);
  log(`Would seed ${DEMO_EMAILS.length} inbox messages`);
  if (env('AGENT_ALERT_USER_ID')) {
    log(`Would seed ${DEMO_CHATS.length} chat threads for ${env('AGENT_ALERT_USER_ID')}`);
  } else {
    console.warn('⚠ AGENT_ALERT_USER_ID is not set — demo chats would be skipped.');
  }
  log(`Would seed ${DEMO_TODOS.length} todos`);
  log(`Would seed ${DEMO_ENGAGEMENT.length} engagement events`);
  if (WITH_BOOKINGS) log('Would run scripts/seed-bookings.ts');
  if (SEND_PUSH) log('Would send demo push notification');
  if (FRESH) log('Would delete prior demo rows first (--fresh)');
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    printDryRunPlan();
    printSummary(new Map());
    log('\nDone (dry run).');
    return;
  }

  const databaseUrl = env('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: poolSsl(databaseUrl), max: 5 });

  try {
    if (FRESH) await freshDemoData(pool);

    await seedCompanyConfig(pool);
    const contacts = await seedContacts();
    await seedJobs(pool, contacts);
    await seedJobComments(pool);
    if (!SKIP_INBOX) {
      await seedEmails(pool, contacts);
      if (!env('RESEND_API_KEY')) await markEmailApiUnset(pool);
    } else log('Skipping inbox seed (--no-inbox)');
    await seedChats(pool);
    if (!SKIP_TODOS) await seedTodos(pool);
    else log('Skipping todos seed (--no-todos)');
    await seedEngagement(pool, contacts);

    if (WITH_BOOKINGS) runBookingsSeed();
    if (SEND_PUSH) await sendDemoPush();

    printSummary(contacts);
    log('\nDone.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
