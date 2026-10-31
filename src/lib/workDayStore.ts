/**
 * Work Day — facade over Postgres (requires DATABASE_URL).
 */

import { isPgConfigured } from './pgPool';
import {
  dbGetActiveSession,
  dbLastLocationSampleTime,
  dbRecordWorkDayLocation,
  dbSaveReconcileRun,
  dbStartWorkDaySession,
  dbStopWorkDaySession,
  dbSwitchWorkDaySegment,
  dbWorkDayWeekSummary,
  mondayOfWeekContaining,
  type WorkDaySession,
  type WorkDaySummaryLine,
} from './pgWorkDay';

export type { WorkDaySession, WorkDaySummaryLine };
export { mondayOfWeekContaining };

export function isWorkDayStoreConfigured(): boolean {
  return isPgConfigured();
}

export async function storeGetActiveWorkDaySession(
  clerkUserId: string,
): Promise<WorkDaySession | null> {
  if (!isPgConfigured()) return null;
  return dbGetActiveSession(clerkUserId);
}

export async function storeStartWorkDaySession(clerkUserId: string, jobSlug: string) {
  if (!isPgConfigured()) return { ok: false as const, error: 'DATABASE_URL is not configured' };
  return dbStartWorkDaySession(clerkUserId, jobSlug);
}

export async function storeStopWorkDaySession(clerkUserId: string) {
  if (!isPgConfigured()) return { ok: false as const, error: 'DATABASE_URL is not configured' };
  return dbStopWorkDaySession(clerkUserId);
}

export async function storeSwitchWorkDaySegment(clerkUserId: string, jobSlug: string) {
  if (!isPgConfigured()) return { ok: false as const, error: 'DATABASE_URL is not configured' };
  return dbSwitchWorkDaySegment(clerkUserId, jobSlug);
}

export async function storeRecordWorkDayLocation(input: {
  clerkUserId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}) {
  if (!isPgConfigured()) return { ok: false as const, error: 'DATABASE_URL is not configured' };
  return dbRecordWorkDayLocation(input);
}

export async function storeLastWorkDayLocationTime(sessionId: string): Promise<string | null> {
  if (!isPgConfigured()) return null;
  return dbLastLocationSampleTime(sessionId);
}

export async function storeWorkDayWeekSummary(weekStart: string) {
  if (!isPgConfigured()) {
    return { lines: [] as WorkDaySummaryLine[], approved: false, approvedAt: null as string | null };
  }
  const summary = await dbWorkDayWeekSummary(weekStart);
  return summary ?? { lines: [], approved: false, approvedAt: null };
}

export async function storeSaveWorkDayReconcile(input: {
  weekStart: string;
  approvedBy: string;
  payload: unknown;
}): Promise<boolean> {
  if (!isPgConfigured()) return false;
  return dbSaveReconcileRun(input);
}
