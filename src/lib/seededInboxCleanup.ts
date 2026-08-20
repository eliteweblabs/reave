/**
 * Wipe first-boot sample inbox rows when live email is connected for the first time.
 *
 * Installs without RESEND_API_KEY seed fake mail so the dashboard is not empty.
 * When the key later goes from blank/null → set, those rows would contaminate the
 * live inbox — delete them. Rotating an already-present key must not wipe.
 */
import { isDemoMode } from './demoMode';
import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import { storeDeleteSeededInboxEmails } from './emailInboxStore';
import { storeGetEmailApiSeen, storeSetEmailApiSeen } from './emailRuleStore';
import { scheduleReviewsBadgePush } from './pushBadgeSync';
import {
  isEmailApiConfigured as emailApiConfiguredFromEnv,
  seededInboxCleanupAction,
  type EmailApiSeenState,
  type SeededInboxCleanupAction,
} from './seededInboxPolicy';
import { serverEnv } from './serverEnv';

export { seededInboxCleanupAction, type EmailApiSeenState, type SeededInboxCleanupAction };

export type SeededInboxCleanupResult = {
  action: SeededInboxCleanupAction;
  deleted: number;
  persistedSeen: EmailApiSeenState;
};

/** True when RESEND_API_KEY is present (blank / whitespace / missing = unset). */
export function isEmailApiConfigured(env?: { RESEND_API_KEY?: string | undefined }): boolean {
  return emailApiConfiguredFromEnv(env ?? { RESEND_API_KEY: serverEnv('RESEND_API_KEY') });
}

let _memorySeen: EmailApiSeenState | undefined = undefined;
let _inFlight: Promise<SeededInboxCleanupResult> | null = null;

export function resetSeededInboxCleanupMemory(): void {
  _memorySeen = undefined;
  _inFlight = null;
}

async function wipeSeededInbox(): Promise<number> {
  const { deleted, ids } = await storeDeleteSeededInboxEmails();
  for (const id of ids) {
    await dismissEmailRelatedNotifications(id, {
      markAutomationAck: false,
      syncBadge: false,
    }).catch(() => undefined);
  }
  if (deleted > 0) scheduleReviewsBadgePush();
  return deleted;
}

async function runSeededInboxCleanup(): Promise<SeededInboxCleanupResult> {
  const apiConfigured = isEmailApiConfigured();
  const previouslySeen =
    _memorySeen !== undefined ? _memorySeen : await storeGetEmailApiSeen();
  const action = seededInboxCleanupAction({
    apiConfigured,
    previouslySeen,
    demoMode: isDemoMode(),
  });

  let deleted = 0;
  let persistedSeen: EmailApiSeenState = previouslySeen;

  if (action === 'wipe') {
    deleted = await wipeSeededInbox();
    await storeSetEmailApiSeen(true);
    persistedSeen = true;
    console.info('[email] wiped seeded inbox after first email API', { deleted });
  } else if (action === 'mark-set') {
    await storeSetEmailApiSeen(true);
    persistedSeen = true;
  } else if (action === 'mark-unset') {
    await storeSetEmailApiSeen(false);
    persistedSeen = false;
  }

  _memorySeen = persistedSeen;
  return { action, deleted, persistedSeen };
}

/**
 * Observe RESEND_API_KEY and wipe sample inbox rows on the first blank→set
 * transition. Cheap after the key has been seen as set (in-process latch).
 */
export async function ensureSeededInboxClearedOnLiveEmail(): Promise<SeededInboxCleanupResult> {
  const configured = isEmailApiConfigured();
  if (_memorySeen === true) {
    return { action: 'noop', deleted: 0, persistedSeen: true };
  }
  if (_memorySeen === false && !configured) {
    return { action: 'noop', deleted: 0, persistedSeen: false };
  }
  if (_inFlight) return _inFlight;
  _inFlight = runSeededInboxCleanup().finally(() => {
    _inFlight = null;
  });
  return _inFlight;
}
