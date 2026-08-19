/**
 * Active time-tracking timer — one running timer per deployment owner (Siri / dashboard).
 * Postgres when DATABASE_URL is set; otherwise JSON under WORK_DIR/.time/.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isSafeWorkSlug, isWorkDbConfigured, workDir } from './workStore';
import { storeAppendTimeEntry } from './timeEntries';

export interface ActiveTimer {
  jobSlug: string;
  startedAt: string;
  note: string;
}

const DEFAULT_OWNER_KEY = 'default';
const MIN_LOGGED_HOURS = 0.01;

function activeTimerPath(): string {
  const dir = join(workDir(), '.time');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, '_active-timer.json');
}

function fileGetActiveTimer(): ActiveTimer | null {
  const path = activeTimerPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const jobSlug = typeof parsed.jobSlug === 'string' ? parsed.jobSlug.trim() : '';
    const startedAt = typeof parsed.startedAt === 'string' ? parsed.startedAt.trim() : '';
    if (!jobSlug || !startedAt || !isSafeWorkSlug(jobSlug)) return null;
    return {
      jobSlug,
      startedAt,
      note: typeof parsed.note === 'string' ? parsed.note.trim() : '',
    };
  } catch {
    return null;
  }
}

function fileSetActiveTimer(jobSlug: string, note = ''): ActiveTimer {
  const startedAt = new Date().toISOString();
  const timer: ActiveTimer = { jobSlug, startedAt, note };
  writeFileSync(activeTimerPath(), `${JSON.stringify(timer, null, 2)}\n`, 'utf8');
  return timer;
}

function fileClearActiveTimer(): boolean {
  const path = activeTimerPath();
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export async function getActiveTimer(_ownerKey = DEFAULT_OWNER_KEY): Promise<ActiveTimer | null> {
  if (isWorkDbConfigured()) {
    const { dbGetActiveTimer } = await import('./pgActiveTimers');
    const row = await dbGetActiveTimer(_ownerKey);
    if (row) return row;
  }
  return fileGetActiveTimer();
}

export async function setActiveTimer(
  jobSlug: string,
  note = '',
  ownerKey = DEFAULT_OWNER_KEY,
): Promise<ActiveTimer | { ok: false; error: string }> {
  if (!isSafeWorkSlug(jobSlug)) return { ok: false, error: 'Invalid project slug' };

  if (isWorkDbConfigured()) {
    const { dbSetActiveTimer } = await import('./pgActiveTimers');
    const row = await dbSetActiveTimer(ownerKey, jobSlug, note);
    if (row) return row;
  }
  return fileSetActiveTimer(jobSlug, note);
}

export async function clearActiveTimer(ownerKey = DEFAULT_OWNER_KEY): Promise<boolean> {
  if (isWorkDbConfigured()) {
    const { dbClearActiveTimer } = await import('./pgActiveTimers');
    const cleared = await dbClearActiveTimer(ownerKey);
    if (cleared) return true;
  }
  return fileClearActiveTimer();
}

export function elapsedHoursFromStartedAt(startedAt: string, now = Date.now()): number {
  const ms = now - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const hours = ms / 3_600_000;
  return Math.round(hours * 100) / 100;
}

export function formatElapsedDuration(startedAt: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(startedAt).getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'less than a minute';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export async function stopActiveTimerAndLog(
  ownerKey = DEFAULT_OWNER_KEY,
): Promise<
  | {
      ok: true;
      jobSlug: string;
      hours: number;
      logged: boolean;
      startedAt: string;
      elapsedLabel: string;
    }
  | { ok: false; error: string }
> {
  const timer = await getActiveTimer(ownerKey);
  if (!timer) return { ok: false, error: 'No timer is running' };

  const hours = elapsedHoursFromStartedAt(timer.startedAt);
  const elapsedLabel = formatElapsedDuration(timer.startedAt);
  await clearActiveTimer(ownerKey);

  if (hours < MIN_LOGGED_HOURS) {
    return {
      ok: true,
      jobSlug: timer.jobSlug,
      hours: 0,
      logged: false,
      startedAt: timer.startedAt,
      elapsedLabel,
    };
  }

  const note = timer.note.trim() || 'Timer';
  const saved = await storeAppendTimeEntry(timer.jobSlug, {
    hours,
    note,
    createdAt: new Date().toISOString(),
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  return {
    ok: true,
    jobSlug: timer.jobSlug,
    hours,
    logged: true,
    startedAt: timer.startedAt,
    elapsedLabel,
  };
}
