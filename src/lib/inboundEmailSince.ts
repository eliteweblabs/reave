/**
 * Cutoff for inbound email processing — ignore messages sent before the system went live.
 * Uses the email's Date header (not webhook arrival time) so forwarded backlog is dropped.
 */

import { serverEnv } from './serverEnv';

function inboundFilterDisabled(): boolean {
  const raw = serverEnv('EMAIL_INBOUND_FILTER')?.trim().toLowerCase();
  return raw === '0' || raw === 'false' || raw === 'off';
}

function parseSinceEnv(): Date | null {
  const raw = serverEnv('EMAIL_INBOUND_SINCE')?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadInboundSinceFromStore(): Promise<Date | null> {
  const { storeGetInboundSince } = await import('./emailRuleStore');
  const iso = await storeGetInboundSince();
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function persistInboundSince(date: Date): Promise<void> {
  const { storeSetInboundSince } = await import('./emailRuleStore');
  await storeSetInboundSince(date.toISOString()).catch(() => undefined);
}

/** Resolved cutoff, or null when filtering is disabled. Does not auto-initialize. */
export async function getInboundSince(): Promise<Date | null> {
  if (inboundFilterDisabled()) return null;
  return parseSinceEnv() ?? (await loadInboundSinceFromStore());
}

/**
 * Return the active cutoff, auto-initializing to now() on first inbound message when unset.
 * Env `EMAIL_INBOUND_SINCE` always wins; set `EMAIL_INBOUND_FILTER=0` to disable.
 */
export async function ensureInboundSince(): Promise<Date | null> {
  if (inboundFilterDisabled()) return null;

  const fromEnv = parseSinceEnv();
  if (fromEnv) return fromEnv;

  const stored = await loadInboundSinceFromStore();
  if (stored) return stored;

  const now = new Date();
  await persistInboundSince(now);
  console.info('[email] inbound cutoff initialized', { inboundSince: now.toISOString() });
  return now;
}

/** True when the message should enter triage (at or after the cutoff). */
export function isInboundEmailAllowed(emailDate: Date, since: Date | null): boolean {
  if (!since) return true;
  // Small grace for delivery delay / clock skew on the go-live message itself.
  const graceMs = 5 * 60 * 1000;
  return emailDate.getTime() >= since.getTime() - graceMs;
}
