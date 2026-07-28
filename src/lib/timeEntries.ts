/**
 * Time entries on work/jobs — hours + note per row.
 * Postgres when DATABASE_URL is set; otherwise JSON files under WORK_DIR/.time/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isSafeWorkSlug, isWorkDbConfigured, workDir } from './workStore';

export interface WorkTimeEntry {
  id: string;
  slug: string;
  /** Billable hours (e.g. 1.5). */
  hours: number;
  note: string;
  createdAt: string;
}

const MAX_NOTE_LENGTH = 500;
const MAX_HOURS = 9999;
const MAX_ENTRIES = 200;

function timeDir(): string {
  const dir = join(workDir(), '.time');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function timeFilePath(slug: string): string {
  return join(timeDir(), `${slug}.json`);
}

function normalizeHours(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_HOURS) return null;
  return Math.round(n * 100) / 100;
}

function normalizeEntry(raw: unknown, slug: string): WorkTimeEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const hours = normalizeHours(o.hours);
  if (hours == null) return null;
  const note = typeof o.note === 'string' ? o.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : randomUUID(),
    slug,
    hours,
    note,
    createdAt:
      typeof o.createdAt === 'string' && o.createdAt.trim()
        ? o.createdAt.trim()
        : new Date().toISOString(),
  };
}

function normalizeInputEntries(
  raw: unknown,
  slug: string,
): { ok: true; entries: WorkTimeEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'entries must be an array' };
  if (raw.length > MAX_ENTRIES) {
    return { ok: false, error: `At most ${MAX_ENTRIES} time entries per project` };
  }
  const entries: WorkTimeEntry[] = [];
  for (const row of raw) {
    const entry = normalizeEntry(row, slug);
    if (!entry) return { ok: false, error: 'Each entry needs hours greater than 0' };
    entries.push(entry);
  }
  return { ok: true, entries };
}

function fileListTimeEntries(slug: string): WorkTimeEntry[] {
  if (!isSafeWorkSlug(slug)) return [];
  const path = timeFilePath(slug);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeEntry(row, slug))
      .filter((e): e is WorkTimeEntry => !!e)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

function fileSaveTimeEntries(
  slug: string,
  entries: WorkTimeEntry[],
): { ok: true; entries: WorkTimeEntry[] } | { ok: false; error: string } {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  writeFileSync(timeFilePath(slug), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return { ok: true, entries };
}

export async function storeListTimeEntries(slug: string): Promise<WorkTimeEntry[]> {
  if (isWorkDbConfigured()) {
    const { dbListJobTimeEntries } = await import('./pgJobs');
    const rows = await dbListJobTimeEntries(slug);
    if (rows) return rows;
  }
  return fileListTimeEntries(slug);
}

export async function storeSaveTimeEntries(
  slug: string,
  rawEntries: unknown,
): Promise<{ ok: true; entries: WorkTimeEntry[]; totalHours: number } | { ok: false; error: string }> {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  const parsed = normalizeInputEntries(rawEntries, slug);
  if (!parsed.ok) return parsed;

  if (isWorkDbConfigured()) {
    const { dbSaveJobTimeEntries } = await import('./pgJobs');
    const result = await dbSaveJobTimeEntries(slug, parsed.entries);
    if (result) return result;
  }
  const saved = fileSaveTimeEntries(slug, parsed.entries);
  if (!saved.ok) return saved;
  const totalHours = saved.entries.reduce((sum, e) => sum + e.hours, 0);
  return { ok: true, entries: saved.entries, totalHours: Math.round(totalHours * 100) / 100 };
}

export function sumTimeEntryHours(entries: WorkTimeEntry[]): number {
  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  return Math.round(total * 100) / 100;
}
