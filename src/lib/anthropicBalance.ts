import { serverEnv } from './serverEnv';

export type AnthropicBalanceSource = 'live' | 'manual' | 'unconfigured' | 'error';

export type AnthropicBalance = {
  balanceUsd: number | null;
  source: AnthropicBalanceSource;
  detail?: string;
  checkedAt?: string;
};

const CACHE_TTL_MS = 60_000;

let cache: { at: number; value: AnthropicBalance } | null = null;

function parseManualBalance(): number | null {
  const raw = serverEnv('ANTHROPIC_CREDIT_BALANCE_USD')?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatAnthropicBalance(balance: AnthropicBalance | null | undefined): string | null {
  if (!balance || balance.balanceUsd == null) return null;
  return formatUsd(balance.balanceUsd);
}

async function fetchLiveBalance(): Promise<AnthropicBalance> {
  const orgId = serverEnv('ANTHROPIC_ORG_ID')?.trim();
  const sessionKey = serverEnv('ANTHROPIC_SESSION_KEY')?.trim();
  if (!orgId || !sessionKey) {
    const manual = parseManualBalance();
    if (manual != null) {
      return {
        balanceUsd: manual,
        source: 'manual',
        detail: 'ANTHROPIC_CREDIT_BALANCE_USD',
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      balanceUsd: null,
      source: 'unconfigured',
      detail: 'Set ANTHROPIC_ORG_ID + ANTHROPIC_SESSION_KEY (live) or ANTHROPIC_CREDIT_BALANCE_USD (manual)',
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `https://platform.claude.com/api/organizations/${encodeURIComponent(orgId)}/prepaid/credits`,
      {
        headers: { Cookie: `sessionKey=${sessionKey}` },
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      const manual = parseManualBalance();
      if (manual != null) {
        return {
          balanceUsd: manual,
          source: 'manual',
          detail: `live fetch HTTP ${res.status}; using manual fallback`,
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        balanceUsd: null,
        source: 'error',
        detail: res.status === 401 || res.status === 403
          ? 'session expired — refresh ANTHROPIC_SESSION_KEY from console'
          : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    }

    const j = (await res.json()) as { amount?: unknown };
    const cents = typeof j.amount === 'number' ? j.amount : Number(j.amount);
    if (!Number.isFinite(cents) || cents < 0) {
      return {
        balanceUsd: null,
        source: 'error',
        detail: 'unexpected prepaid/credits response',
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      balanceUsd: cents / 100,
      source: 'live',
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    const manual = parseManualBalance();
    if (manual != null) {
      return {
        balanceUsd: manual,
        source: 'manual',
        detail: 'live fetch failed; using manual fallback',
        checkedAt: new Date().toISOString(),
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      balanceUsd: null,
      source: 'error',
      detail: msg.includes('aborted') ? 'timeout' : msg,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Anthropic prepaid credit balance (account-level, shared across models). */
export async function getAnthropicBalance(opts?: {
  refresh?: boolean;
  maxAgeMs?: number;
}): Promise<AnthropicBalance> {
  const now = Date.now();
  const ttl = opts?.refresh ? 0 : (opts?.maxAgeMs ?? CACHE_TTL_MS);
  if (ttl > 0 && cache && now - cache.at < ttl) {
    return cache.value;
  }
  const value = await fetchLiveBalance();
  cache = { at: now, value };
  return value;
}

const DEFAULT_AUDIT_RESERVE_USD = { quick: 1.5, full: 4 } as const;

/** USD that should be in the prepaid account before starting an audit. */
export function auditCreditReserveUsd(tier: 'quick' | 'full'): number {
  const key =
    tier === 'full' ? 'ANTHROPIC_AUDIT_RESERVE_FULL_USD' : 'ANTHROPIC_AUDIT_RESERVE_QUICK_USD';
  const raw = serverEnv(key)?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_AUDIT_RESERVE_USD[tier];
}

/** Mid-run floor — stop before another expensive round if the pot is almost empty. */
export function auditCreditContinueFloorUsd(tier: 'quick' | 'full'): number {
  return Math.max(0.25, Math.round(auditCreditReserveUsd(tier) * 0.25 * 100) / 100);
}

/**
 * Subtract estimated spend from the cached prepaid balance so a long audit
 * can stop before the next round instead of dying on a 400 after most of the work.
 */
export function adjustCachedAnthropicBalance(deltaUsd: number): void {
  if (!cache || cache.value.balanceUsd == null) return;
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  cache = {
    at: cache.at,
    value: {
      ...cache.value,
      balanceUsd: Math.max(0, Math.round((cache.value.balanceUsd + deltaUsd) * 100) / 100),
    },
  };
}

export function evaluateAuditCreditReserve(
  balance: AnthropicBalance,
  neededUsd: number,
  opts?: { phase?: 'start' | 'continue'; tier?: 'quick' | 'full' },
): { ok: true } | { ok: false; reason: string } {
  if (balance.balanceUsd == null) return { ok: true };
  if (balance.balanceUsd + 1e-9 >= neededUsd) return { ok: true };

  const have = formatUsd(balance.balanceUsd);
  const need = formatUsd(neededUsd);
  const kind = opts?.tier === 'full' ? 'full audit' : 'audit';
  if (opts?.phase === 'continue') {
    return {
      ok: false,
      reason:
        `Anthropic credits ran too low to finish this ${kind} (${have} left; need about ${need} more). ` +
        'Add credits and run it again.',
    };
  }
  return {
    ok: false,
    reason:
      `Anthropic credits are too low to start a ${kind}. About ${have} left; this ${kind} needs about ${need}. ` +
      'Add credits in the Anthropic console and try again.',
  };
}

/** Fail open when live/manual balance is unknown so installs without org credentials still audit. */
export async function checkAnthropicCreditsForAudit(
  tier: 'quick' | 'full',
  phase: 'start' | 'continue',
  opts?: { refresh?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const balance = await getAnthropicBalance({ refresh: opts?.refresh === true });
  const needed =
    phase === 'start' ? auditCreditReserveUsd(tier) : auditCreditContinueFloorUsd(tier);
  return evaluateAuditCreditReserve(balance, needed, { phase, tier });
}
