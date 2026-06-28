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
export async function getAnthropicBalance(opts?: { refresh?: boolean }): Promise<AnthropicBalance> {
  const now = Date.now();
  if (!opts?.refresh && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const value = await fetchLiveBalance();
  cache = { at: now, value };
  return value;
}
