/**
 * Shared types and helpers for the workflow health check suite.
 *
 * Each "check" is a small async function that probes one external service
 * or internal route and returns a CheckResult. The runner in
 * `src/pages/api/health/check.ts` executes them all in parallel under a
 * hard timeout.
 */

export type CheckStatus = 'ok' | 'fail' | 'skipped';

export interface CheckResult {
  /** Stable machine name, e.g. "vapi" or "twilio". */
  name: string;
  /** Human label shown in the dashboard, e.g. "Vapi assistant reachable". */
  label: string;
  status: CheckStatus;
  /** Wall-clock duration of the check in ms. */
  ms: number;
  /** One-line message: error reason on fail, reason on skip, summary on ok. */
  detail?: string;
}

export type CheckFn = () => Promise<Omit<CheckResult, 'ms'>>;

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Runs a check with a hard timeout. If the check throws or times out,
 * returns a `fail` result instead of propagating the error, so one bad
 * check can never crash the whole suite.
 */
export async function runCheck(
  name: string,
  label: string,
  fn: CheckFn,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CheckResult> {
  const start = Date.now();

  const timeout = new Promise<Omit<CheckResult, 'ms'>>((resolve) => {
    setTimeout(
      () =>
        resolve({
          name,
          label,
          status: 'fail',
          detail: `Timed out after ${timeoutMs}ms`,
        }),
      timeoutMs
    );
  });

  try {
    const result = await Promise.race([fn(), timeout]);
    return { ...result, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      label,
      status: 'fail',
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Helper: fetch with a per-request AbortSignal so checks can't hang
 * past their parent timeout.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 4_000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
