/**
 * Background Google review sync — polls Places API on an interval when sync is enabled.
 */
import { hasFeature } from './features';
import { getOnlineReviewsConfig } from './onlineReviewsStore';
import { syncGoogleReviews } from './onlineReviewsSync';
import { serverEnv } from './serverEnv';

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

function pollIntervalMs(): number {
  const min = Number(serverEnv('ONLINE_REVIEWS_POLL_MINUTES') || 120);
  return Math.max(30, Math.min(min, 1440)) * 60_000;
}

export function onlineReviewsPollSecret(): string | null {
  return serverEnv('ONLINE_REVIEWS_POLL_SECRET')?.trim() || null;
}

export type OnlineReviewsSyncRunResult = {
  ok: boolean;
  skipped?: string;
  syncResult?: Awaited<ReturnType<typeof syncGoogleReviews>>;
  error?: string;
};

export async function runOnlineReviewsSync(options?: {
  force?: boolean;
  source?: 'cron' | 'admin';
}): Promise<OnlineReviewsSyncRunResult> {
  if (!hasFeature('online_reviews')) {
    return { ok: false, skipped: 'online_reviews not enabled' };
  }

  const config = await getOnlineReviewsConfig();
  if (!config.syncEnabled && !options?.force) {
    return { ok: true, skipped: 'sync disabled in Reviews settings' };
  }

  if (_running) return { ok: false, skipped: 'sync already running' };
  _running = true;
  try {
    const syncResult = await syncGoogleReviews();
    const ok = syncResult.errors.length === 0;
    if (!ok) {
      console.warn('[online-reviews] sync errors', syncResult.errors);
    } else if (syncResult.upserted > 0) {
      console.info('[online-reviews] synced', {
        source: options?.source ?? 'cron',
        upserted: syncResult.upserted,
      });
    }
    return { ok, syncResult };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    console.warn('[online-reviews] sync failed', message);
    return { ok: false, error: message };
  } finally {
    _running = false;
  }
}

export function ensureOnlineReviewsScheduler(): void {
  if (_timer) return;
  if (!hasFeature('online_reviews')) return;
  if (!serverEnv('DATABASE_URL')?.trim()) return;

  const ms = pollIntervalMs();
  void runOnlineReviewsSync({ source: 'cron' }).catch((e) =>
    console.warn('[online-reviews] initial sync failed', e),
  );
  _timer = setInterval(() => {
    void runOnlineReviewsSync({ source: 'cron' }).catch((e) =>
      console.warn('[online-reviews] scheduled sync failed', e),
    );
  }, ms);
  console.info('[online-reviews] scheduler started', { intervalMinutes: ms / 60_000 });
}
