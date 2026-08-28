/**
 * Situational awareness for the admin agent: who it works for, recent
 * Sessions, and whether a deploy-failure alert should reuse an existing
 * repair thread instead of opening a new one.
 *
 * Pure helpers — no Postgres / Clerk so verify scripts can import this file.
 */
import { titleFromMessage, type ChatThreadSummary, type ChatTurn } from './chatTypes';

export const DEPLOY_FAILURE_TITLE_PREFIX = 'Deploy failed —';
export const DEPLOY_FAILURE_REUSE_MS = 6 * 60 * 60 * 1000;
export const DEPLOY_FAILURE_RERUN_COOLDOWN_MS = 8 * 60 * 1000;
/** Hard cap so a webhook storm + env-var redeploys cannot burn unlimited Opus runs. */
export const DEPLOY_FAILURE_MAX_AUTO_RUNS = 3;
export const MAX_RECENT_SESSIONS_IN_PROMPT = 12;

export type ReusableAlertThread = {
  id: string;
  title: string;
  updated_at: string;
};

export type RepairFollowUpDecision =
  | 'run'
  | 'suppress-running'
  | 'suppress-cooldown'
  | 'suppress-exhausted';

export type OwnerIdentityInput = {
  companyName: string;
  domain?: string;
  siteUrl?: string;
  ownerName?: string;
  ownerEmail?: string;
};

/** First-line Session title for a deploy-failure repair chat. */
export function deployFailureAlertTitle(service?: string): string {
  return titleFromMessage(`${DEPLOY_FAILURE_TITLE_PREFIX} ${normalizeServiceName(service)}`);
}

export function normalizeServiceName(service?: string): string {
  const raw = service?.trim() || '';
  if (!raw || raw === '?' || raw.toLowerCase() === 'service') return 'service';
  return raw;
}

/** Prefer an explicit service, then "Deploy failed — X" / "Service: X" in the alert body. */
export function deployFailureServiceName(opts: {
  service?: string;
  message?: string;
}): string {
  const direct = normalizeServiceName(opts.service);
  if (direct !== 'service') return direct;
  const msg = opts.message ?? '';
  const fromTitle = msg.match(/^Deploy failed —\s*(.+)$/m);
  if (fromTitle?.[1]) {
    const named = normalizeServiceName(fromTitle[1]);
    if (named !== 'service') return named;
  }
  const fromField = msg.match(/^Service:\s*(.+)$/m);
  if (fromField?.[1]) return normalizeServiceName(fromField[1]);
  return 'service';
}

export function titlesMatchAlert(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function isDeployFailureTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith(DEPLOY_FAILURE_TITLE_PREFIX.toLowerCase());
}

/**
 * Reuse the open repair Session for this alert title when it is still fresh.
 * Unknown-service titles ("Deploy failed — service") fall back to the newest
 * deploy-failure Session so webhook + email for the same crash stay together.
 */
export function findReusableAlertThread(
  threads: Array<Pick<ChatThreadSummary, 'id' | 'title' | 'updated_at' | 'archived'>>,
  title: string,
  nowMs: number,
  maxAgeMs: number = DEPLOY_FAILURE_REUSE_MS,
): ReusableAlertThread | null {
  const fresh = threads.filter((t) => {
    if (t.archived) return false;
    const updated = Date.parse(t.updated_at);
    return Number.isFinite(updated) && nowMs - updated <= maxAgeMs;
  });

  const exact = fresh.find((t) => titlesMatchAlert(t.title, title));
  if (exact) return { id: exact.id, title: exact.title, updated_at: exact.updated_at };

  if (titlesMatchAlert(title, deployFailureAlertTitle('service'))) {
    const newest = fresh.find((t) => isDeployFailureTitle(t.title));
    if (newest) return { id: newest.id, title: newest.title, updated_at: newest.updated_at };
  }

  return null;
}

export function lastAssistantTurn(turns: ChatTurn[]): ChatTurn | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === 'assistant') return turns[i] ?? null;
  }
  return null;
}

export function lastAssistantIsUnresolved(content: string): boolean {
  return /🚨\s*UNRESOLVED/i.test(content);
}

export function shouldAutoRunRepairFollowUp(opts: {
  runActive: boolean;
  lastAssistantAtMs?: number | null;
  lastAssistantUnresolved?: boolean;
  assistantRunCount?: number;
  nowMs: number;
  cooldownMs?: number;
  maxAutoRuns?: number;
}): RepairFollowUpDecision {
  if (opts.runActive) return 'suppress-running';
  const maxRuns = opts.maxAutoRuns ?? DEPLOY_FAILURE_MAX_AUTO_RUNS;
  if ((opts.assistantRunCount ?? 0) >= maxRuns) return 'suppress-exhausted';
  const cooldown = opts.cooldownMs ?? DEPLOY_FAILURE_RERUN_COOLDOWN_MS;
  // Cooldown after ANY reply — not only 🚨 UNRESOLVED. A mistaken ✅ RESOLVED
  // used to immediately re-run on the next duplicate webhook and burn credits.
  if (opts.lastAssistantAtMs && opts.nowMs - opts.lastAssistantAtMs < cooldown) {
    return 'suppress-cooldown';
  }
  return 'run';
}

export function formatSessionAge(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'recently';
  const sec = Math.floor((nowMs - then) / 1000);
  if (sec < 15) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function formatOwnerIdentityBlock(input: OwnerIdentityInput): string {
  const company = input.companyName.trim() || 'this company';
  const where = input.domain?.trim()
    ? `${company} (${input.domain.trim()})`
    : input.siteUrl?.trim()
      ? `${company} (${input.siteUrl.trim()})`
      : company;
  const owner = input.ownerName?.trim();
  const email = input.ownerEmail?.trim();
  const who = owner
    ? email
      ? `${owner} <${email}>`
      : owner
    : email || 'the signed-in deployment owner';

  return [
    `You work for ${where}. The person you work for is ${who}.`,
    'You are their in-app admin agent across EVERY Session — not a new assistant each chat.',
    'Other Sessions, Durable recall, list_work, and list_chats / get_chat / search_chats are your memory of work already done. Do not start from zero when a recent Session already covers the same problem.',
  ].join(' ');
}

export function formatRecentSessionsBlock(
  threads: Array<Pick<ChatThreadSummary, 'id' | 'title' | 'updated_at' | 'archived'>>,
  opts?: { currentThreadId?: string; nowMs?: number; limit?: number },
): string | null {
  const nowMs = opts?.nowMs ?? Date.now();
  const limit = opts?.limit ?? MAX_RECENT_SESSIONS_IN_PROMPT;
  const current = opts?.currentThreadId?.trim();
  const rows = threads
    .filter((t) => !t.archived && t.id !== current)
    .slice(0, limit);
  if (!rows.length) return null;
  const lines = rows.map((t) => `- ${t.title} · ${formatSessionAge(t.updated_at, nowMs)}`);
  return [
    'Recent Sessions (same owner — you already did this work; call get_chat before repeating it):',
    ...lines,
  ].join('\n');
}

