/**
 * In-memory SWR cache for GET /api/admin/dashboard.
 *
 * Serves recent payloads instantly on repeat loads; rebuilds in the background when
 * stale. Call invalidateDashboardCache() from stores when underlying data changes.
 */

/** Serve cached payload without revalidation. */
const FRESH_MS = 45_000;
/** Return stale payload while rebuilding; hard miss after this. */
const STALE_MS = 5 * 60_000;
const CLIENTS_TOTAL_TTL_MS = 5 * 60_000;

export type DashboardPayload = Record<string, unknown> & { ok: true; generatedAt: string };

type CacheEntry = {
  at: number;
  userId: string;
  payload: DashboardPayload;
};

let cache: CacheEntry | null = null;
let inflight: Promise<DashboardPayload> | null = null;
let inflightUserId = '';
let clientsTotalCache: { at: number; total: number | null } | null = null;

export function peekCachedClientsTotal(): { total: number | null; fresh: boolean } | null {
  if (!clientsTotalCache) return null;
  return {
    total: clientsTotalCache.total,
    fresh: Date.now() - clientsTotalCache.at < CLIENTS_TOTAL_TTL_MS,
  };
}

export function setCachedClientsTotal(total: number | null): void {
  clientsTotalCache = { at: Date.now(), total };
}

export function invalidateDashboardCache(): void {
  cache = null;
  clientsTotalCache = null;
  void import('./bookingClient')
    .then((m) => m.invalidateBookingDashboardCache?.())
    .catch(() => undefined);
  void import('./craterClient')
    .then((m) => m.invalidateCraterBillingDashboardCache?.())
    .catch(() => undefined);
}

export async function getDashboardPayloadCached(
  userId: string,
  build: () => Promise<DashboardPayload>,
  opts: { fresh?: boolean } = {},
): Promise<DashboardPayload> {
  const now = Date.now();

  if (!opts.fresh && cache && cache.userId === userId) {
    const age = now - cache.at;
    if (age < FRESH_MS) return cache.payload;
    if (age < STALE_MS) {
      if (!inflight) {
        inflightUserId = userId;
        inflight = build()
          .then((payload) => {
            cache = { at: Date.now(), userId, payload };
            return payload;
          })
          .finally(() => {
            inflight = null;
            inflightUserId = '';
          });
      }
      return cache.payload;
    }
  }

  if (!opts.fresh && inflight && inflightUserId === userId) return inflight;

  inflightUserId = userId;
  inflight = build()
    .then((payload) => {
      cache = { at: Date.now(), userId, payload };
      return payload;
    })
    .finally(() => {
      inflight = null;
      inflightUserId = '';
    });
  return inflight;
}
