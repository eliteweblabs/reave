/**
 * Background Kinsta/Railway → UptimeRobot site sync.
 * Manual sync from admin starts a long-running job; the UI polls status.
 */
import {
  syncPlatformUrlsToUptime,
  type UptimePlatformSyncProgress,
  type UptimePlatformSyncResult,
} from './uptimeMonitoring';

export type UptimePlatformSyncJobStatus = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  phase: UptimePlatformSyncProgress['phase'] | 'idle' | 'error';
  discovered: number;
  created: number;
  skipped: number;
  pending: number;
  currentSite: string | null;
  result: UptimePlatformSyncResult | null;
  error: string | null;
};

let _running = false;
let _job: UptimePlatformSyncJobStatus = idleJobStatus();

function idleJobStatus(): UptimePlatformSyncJobStatus {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    phase: 'idle',
    discovered: 0,
    created: 0,
    skipped: 0,
    pending: 0,
    currentSite: null,
    result: null,
    error: null,
  };
}

export function getUptimePlatformSyncStatus(): UptimePlatformSyncJobStatus {
  return { ..._job, result: _job.result ? { ..._job.result } : null };
}

export function isUptimePlatformSyncRunning(): boolean {
  return _running;
}

/** Fire-and-forget — returns false if a sync is already running. */
export function startUptimePlatformSyncBackground(): boolean {
  if (_running) return false;
  void executeUptimePlatformSyncJob();
  return true;
}

/** Awaitable — used by the hourly discovery scheduler. */
export async function runUptimePlatformSyncJob(): Promise<UptimePlatformSyncResult> {
  if (_running) {
    return {
      ok: false,
      discovered: 0,
      created: 0,
      skipped: 0,
      pending: 0,
      warnings: [],
      errors: ['Site sync already running'],
      createdItems: [],
      error: 'Site sync already running',
    };
  }
  return executeUptimePlatformSyncJob();
}

async function executeUptimePlatformSyncJob(): Promise<UptimePlatformSyncResult> {
  _running = true;
  _job = {
    ...idleJobStatus(),
    running: true,
    startedAt: new Date().toISOString(),
    phase: 'starting',
  };

  const onProgress = (progress: UptimePlatformSyncProgress) => {
    _job.phase = progress.phase;
    _job.discovered = progress.discovered;
    _job.created = progress.created;
    _job.skipped = progress.skipped;
    _job.pending = progress.pending;
    _job.currentSite = progress.currentSite ?? null;
  };

  try {
    const result = await syncPlatformUrlsToUptime({ background: true, onProgress });
    _job.result = result;
    _job.phase = 'done';
    _job.discovered = result.discovered;
    _job.created = result.created;
    _job.skipped = result.skipped;
    _job.pending = result.pending;
    _job.currentSite = null;
    if (!result.ok && result.error) _job.error = result.error;
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    _job.error = msg;
    _job.phase = 'error';
    return {
      ok: false,
      discovered: _job.discovered,
      created: _job.created,
      skipped: _job.skipped,
      pending: _job.pending,
      warnings: [],
      errors: [msg],
      createdItems: [],
      error: msg,
    };
  } finally {
    _job.running = false;
    _job.finishedAt = new Date().toISOString();
    _running = false;
  }
}
