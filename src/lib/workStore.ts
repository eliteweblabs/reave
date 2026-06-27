/**
 * Job/work markdown files (src/knowledge/jobs/*.md).
 * Each file is a work request tied to a contact via YAML frontmatter.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { getContact, resolveContact } from './contactApi';
import { serverEnv } from './serverEnv';

export const WORK_STATUSES = ['inquiry', 'active', 'done', 'archived'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export interface WorkJobSummary {
  slug: string;
  title: string;
  client: string;
  contact_uid: string;
  contact_name: string;
  status: WorkStatus;
  priority: WorkPriority;
  due_date: string | null;
  value: number | null;
  tags: string[];
  /** How the lead came in — instagram, email, referral, phone, etc. */
  source: string;
  /** Who/what created the record — manual, telegram, dashboard (file storage only). */
  record_origin?: string;
  created: string;
  updated: string;
}

export interface WorkJobDoc extends WorkJobSummary {
  body: string;
  content: string;
}

export interface WorkJobInput {
  title: string;
  /** Preferred: uid from client picker (no fuzzy resolve on save). */
  contact_uid?: string;
  contact_name?: string;
  /** Legacy / bot: fuzzy-resolve by name when contact_uid is omitted. */
  client?: string;
  status?: WorkStatus;
  priority?: WorkPriority;
  due_date?: string | null;
  value?: number | null;
  tags?: string[];
  /** Lead source channel (instagram, email, referral, phone). */
  source?: string;
  body?: string;
  /** Record creation origin — manual, telegram, dashboard (not the lead source). */
  record_origin?: string;
}

const SAFE_SLUG_RE = /^[a-z0-9._-]+$/i;

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function workDir(): string {
  return process.env.WORK_DIR?.trim() || join(projectRoot(), 'src', 'knowledge', 'jobs');
}

export function isSafeWorkSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug);
}

function ensureWorkDir(): string {
  const dir = workDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    meta[m[1]] = val;
  }
  return { meta, body: match[2].trim() };
}

/** Read only the frontmatter block (+ first heading) — not the full job body. */
function readWorkSummaryFromFile(path: string, slug: string): WorkJobSummary {
  const SUMMARY_BYTES = 4096;
  let prefix = '';
  try {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(SUMMARY_BYTES);
      const n = readSync(fd, buf, 0, SUMMARY_BYTES, 0);
      prefix = buf.slice(0, n).toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return summaryFromMeta(slug, {}, '');
  }

  const { meta, body } = parseFrontmatter(prefix);
  return summaryFromMeta(slug, meta, body);
}

function listWorkFiles(): string[] {
  const dir = workDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/i, ''));
}

function sortWorkSummaries(jobs: WorkJobSummary[]): WorkJobSummary[] {
  return jobs.sort((a, b) => {
    const aT = a.updated || a.created || a.slug;
    const bT = b.updated || b.created || b.slug;
    return bT.localeCompare(aT);
  });
}

function yamlLine(key: string, value: string): string {
  const needsQuote = /[:#'"[\]{}]|^\s|\s$/.test(value) || value.includes('\n');
  if (needsQuote) {
    return `${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `${key}: ${value}`;
}

function normalizeStatus(raw: string | undefined): WorkStatus {
  const s = (raw ?? 'inquiry').toLowerCase();
  return WORK_STATUSES.includes(s as WorkStatus) ? (s as WorkStatus) : 'inquiry';
}

function normalizePriority(raw: string | undefined): WorkPriority {
  const p = (raw ?? 'normal').toLowerCase();
  return WORK_PRIORITIES.includes(p as WorkPriority) ? (p as WorkPriority) : 'normal';
}

export const normalizeWorkStatus = normalizeStatus;
export const normalizeWorkPriority = normalizePriority;

const RECORD_ORIGINS = new Set(['manual', 'telegram', 'dashboard', 'file', 'db']);

function parseTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

function parseValue(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function splitMetaSource(meta: Record<string, string>): { source: string; record_origin?: string } {
  const raw = meta.lead_source?.trim() || meta.source?.trim() || '';
  if (RECORD_ORIGINS.has(raw.toLowerCase())) {
    return { source: meta.lead_source?.trim() || '', record_origin: raw };
  }
  return { source: raw, record_origin: meta.origin?.trim() || meta.record_origin?.trim() || undefined };
}

export function listWorkFileSlugs(): string[] {
  return listWorkFiles();
}

function summaryFromMeta(slug: string, meta: Record<string, string>, body: string): WorkJobSummary {
  const title =
    meta.title?.trim() ||
    body.split('\n').find((l) => l.startsWith('# '))?.slice(2).trim() ||
    slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const { source, record_origin } = splitMetaSource(meta);

  return {
    slug,
    title,
    client: meta.client?.trim() || meta.contact_name?.trim() || '',
    contact_uid: meta.contact_uid?.trim() || '',
    contact_name: meta.contact_name?.trim() || meta.client?.trim() || '',
    status: normalizeStatus(meta.status),
    priority: normalizePriority(meta.priority),
    due_date: meta.due_date?.trim() || null,
    value: parseValue(meta.value),
    tags: parseTags(meta.tags),
    source,
    record_origin: record_origin || 'manual',
    created: meta.created?.trim() || '',
    updated: meta.updated?.trim() || '',
  };
}

function buildMarkdown(
  input: WorkJobInput,
  contact: { uid: string; name: string },
  existing?: WorkJobSummary,
): string {
  const now = new Date().toISOString();
  const title = input.title.trim();
  const body = (input.body ?? '').trim();
  const status = normalizeStatus(input.status ?? existing?.status);
  const priority = normalizePriority(input.priority ?? existing?.priority);
  const recordOrigin = input.record_origin?.trim() || existing?.record_origin || 'manual';
  const leadSource = input.source?.trim() ?? existing?.source ?? '';
  const dueDate = input.due_date !== undefined ? input.due_date : existing?.due_date;
  const value =
    input.value !== undefined ? input.value : existing?.value ?? null;
  const tags = input.tags ?? existing?.tags ?? [];
  const created = existing?.created || now;

  const lines = [
    '---',
    yamlLine('title', title),
    yamlLine('client', contact.name),
    yamlLine('contact_uid', contact.uid),
    yamlLine('contact_name', contact.name),
    yamlLine('status', status),
    yamlLine('priority', priority),
    yamlLine('origin', recordOrigin),
  ];
  if (leadSource) lines.push(yamlLine('lead_source', leadSource));
  if (dueDate) lines.push(yamlLine('due_date', dueDate));
  if (value != null) lines.push(yamlLine('value', String(value)));
  if (tags.length) lines.push(yamlLine('tags', tags.join(', ')));
  lines.push(
    yamlLine('created', created),
    yamlLine('updated', now),
    '---',
    '',
    body || `# ${title}`,
    '',
  );

  return lines.join('\n');
}

export async function resolveWorkContact(
  input: WorkJobInput,
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string }> {
  const uid = input.contact_uid?.trim();
  const name = input.contact_name?.trim();
  // UI picker sends uid + name — trust them (no contact-api round trip on save).
  if (uid && name) return { ok: true, uid, name };
  if (uid) {
    const result = await getContact(uid);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, uid: result.data.uid, name: result.data.name };
  }
  return resolveWorkClient(input.client?.trim() || name || '');
}

export async function resolveWorkClient(
  client: string,
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string }> {
  const name = client.trim();
  if (!name) return { ok: false, error: 'client is required' };

  const result = await resolveContact({ name });
  if (!result.ok) return { ok: false, error: result.error };

  const payload = result.data as Record<string, unknown>;
  const match = String(payload.match ?? '').toLowerCase();
  const contact = payload.contact as Record<string, unknown> | undefined;
  const uid = contact?.uid != null ? String(contact.uid) : '';

  if (!uid || match === 'none') {
    return {
      ok: false,
      error: 'No matching contact found. Add the client in contact-api first.',
    };
  }

  return {
    ok: true,
    uid,
    name: contact?.name != null ? String(contact.name) : name,
  };
}

export function fileListWork(opts?: {
  contact_uid?: string;
  status?: WorkStatus;
  q?: string;
}): WorkJobSummary[] {
  const dir = workDir();
  if (!existsSync(dir)) return [];

  let jobs = listWorkFiles().map((slug) =>
    readWorkSummaryFromFile(join(dir, `${slug}.md`), slug),
  );

  const uid = opts?.contact_uid?.trim();
  if (uid) jobs = jobs.filter((j) => j.contact_uid === uid);

  if (opts?.status) jobs = jobs.filter((j) => j.status === opts.status);

  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    jobs = jobs.filter(
      (j) =>
        j.slug.includes(q) ||
        j.title.toLowerCase().includes(q) ||
        j.client.toLowerCase().includes(q) ||
        j.contact_name.toLowerCase().includes(q),
    );
  }

  return sortWorkSummaries(jobs);
}

export function fileListWorkForContact(contactUid: string): WorkJobSummary[] {
  return fileListWork({ contact_uid: contactUid });
}

export function fileReadWork(slug: string): WorkJobDoc | null {
  if (!isSafeWorkSlug(slug)) return null;
  const path = join(workDir(), `${slug}.md`);
  if (!existsSync(path)) return null;

  const content = readFileSync(path, 'utf8');
  const { meta, body } = parseFrontmatter(content);
  const summary = summaryFromMeta(slug, meta, body);
  return { ...summary, body, content };
}

export async function fileWriteWork(
  slug: string,
  input: WorkJobInput,
): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  if (!input.title.trim()) return { ok: false, error: 'title is required' };

  const contact = await resolveWorkContact(input);
  if (!contact.ok) return { ok: false, error: contact.error };

  const existing = fileReadWork(slug);
  const markdown = buildMarkdown(input, { uid: contact.uid, name: contact.name }, existing ?? undefined);

  ensureWorkDir();
  const path = join(workDir(), `${slug}.md`);
  writeFileSync(path, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');

  const doc = fileReadWork(slug);
  if (!doc) return { ok: false, error: 'Failed to write file' };
  return { ok: true, doc };
}

export function fileDeleteWork(slug: string): boolean {
  if (!isSafeWorkSlug(slug)) return false;
  const path = join(workDir(), `${slug}.md`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** True when Railway Postgres (DATABASE_URL) backs work/jobs storage. */
export function isWorkDbConfigured(): boolean {
  return !!serverEnv('DATABASE_URL')?.trim();
}

export async function storeListWork(opts?: {
  contact_uid?: string;
  status?: WorkStatus;
  q?: string;
}): Promise<WorkJobSummary[]> {
  if (isWorkDbConfigured()) {
    const { dbListWork } = await import('./pgJobs');
    const rows = await dbListWork(opts);
    if (rows) return rows;
  }
  return fileListWork(opts);
}

export async function storeReadWork(slug: string): Promise<WorkJobDoc | null> {
  if (isWorkDbConfigured()) {
    const { dbReadWork } = await import('./pgJobs');
    const doc = await dbReadWork(slug);
    if (doc) return doc;
  }
  return fileReadWork(slug);
}

export async function storeWriteWork(
  slug: string,
  input: WorkJobInput,
): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  if (!input.title.trim()) return { ok: false, error: 'title is required' };

  const contact = await resolveWorkContact(input);
  if (!contact.ok) return { ok: false, error: contact.error };

  if (isWorkDbConfigured()) {
    const { dbReadWork, dbCreateWork, dbUpdateWork } = await import('./pgJobs');
    const existing = await dbReadWork(slug);
    if (existing) {
      return dbUpdateWork(slug, {
        title: input.title.trim(),
        client: contact.name,
        client_uid: contact.uid,
        status: input.status != null ? normalizeStatus(input.status) : undefined,
        priority: input.priority != null ? normalizePriority(input.priority) : undefined,
        due_date: input.due_date,
        value: input.value,
        tags: input.tags,
        source: input.source,
        body: input.body != null ? input.body.trim() : undefined,
      });
    }
    return dbCreateWork({
      slug,
      title: input.title.trim(),
      client: contact.name,
      client_uid: contact.uid,
      status: normalizeStatus(input.status),
      priority: normalizePriority(input.priority),
      due_date: input.due_date ?? null,
      value: input.value ?? null,
      tags: input.tags ?? [],
      source: input.source?.trim() ?? '',
      body: (input.body ?? '').trim(),
    });
  }

  return fileWriteWork(slug, input);
}

export async function storeDeleteWork(slug: string): Promise<boolean> {
  if (isWorkDbConfigured()) {
    const { dbDeleteWork } = await import('./pgJobs');
    const result = await dbDeleteWork(slug);
    return result.ok;
  }
  return fileDeleteWork(slug);
}

export async function storeListWorkForContact(contactUid: string): Promise<WorkJobSummary[]> {
  return storeListWork({ contact_uid: contactUid });
}

function formatEmailNoteBlock(
  note: string,
  meta?: { subject?: string; from?: string },
): string {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const lines = [`\n\n---\n**Email** _${when} UTC_`];
  if (meta?.from) lines.push(`From: ${meta.from}`);
  if (meta?.subject) lines.push(`Subject: ${meta.subject}`);
  lines.push('', note.trim(), '');
  return lines.join('\n');
}

function fileAppendWorkNote(
  slug: string,
  block: string,
): { ok: true; doc: WorkJobDoc } | { ok: false; error: string } {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  const doc = fileReadWork(slug);
  if (!doc) return { ok: false, error: 'Not found' };
  const content = doc.content.endsWith('\n')
    ? doc.content + block.replace(/^\n+/, '')
    : `${doc.content}${block}`;
  const path = join(workDir(), `${slug}.md`);
  writeFileSync(path, content, 'utf8');
  const updated = fileReadWork(slug);
  if (!updated) return { ok: false, error: 'Failed to read back' };
  return { ok: true, doc: updated };
}

/** Append a timestamped email note to a job body (Postgres or markdown file). */
export async function storeAppendWorkNote(
  slug: string,
  note: string,
  meta?: { subject?: string; from?: string },
): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  if (!note.trim()) return { ok: false, error: 'Empty note' };
  const block = formatEmailNoteBlock(note, meta);
  if (isWorkDbConfigured()) {
    const { dbAppendWorkNote } = await import('./pgJobs');
    return dbAppendWorkNote(slug, block);
  }
  return fileAppendWorkNote(slug, block);
}

export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
