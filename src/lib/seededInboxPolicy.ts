/**
 * When to wipe first-boot sample inbox rows after live email is connected.
 * Pure helpers — no Postgres / store imports (safe for verify scripts).
 */

export type EmailApiSeenState = boolean | null;

export type SeededInboxCleanupAction = 'wipe' | 'mark-unset' | 'mark-set' | 'noop';

/** True when the Resend email API key is present (blank / whitespace = unset). */
export function isEmailApiConfigured(env: { RESEND_API_KEY?: string | undefined }): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

/**
 * Decide what to do given the current key and the last persisted observation.
 *
 * - previouslySeen true → API was already set; rotation / later changes are a no-op.
 * - previouslySeen false + key now set → first blank→set transition → wipe.
 * - previouslySeen null + key already set → existing install; record set, do not wipe.
 * - key still blank → remember it was unset (so a later first set can wipe).
 */
export function seededInboxCleanupAction(opts: {
  apiConfigured: boolean;
  previouslySeen: EmailApiSeenState;
  demoMode?: boolean;
}): SeededInboxCleanupAction {
  if (opts.previouslySeen === true) return 'noop';

  if (opts.demoMode) {
    if (opts.apiConfigured) return 'mark-set';
    return opts.previouslySeen === false ? 'noop' : 'mark-unset';
  }

  if (!opts.apiConfigured) {
    return opts.previouslySeen === false ? 'noop' : 'mark-unset';
  }

  if (opts.previouslySeen === false) return 'wipe';
  return 'mark-set';
}
