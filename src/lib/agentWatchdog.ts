/**
 * Deadlines for the chat agent.
 *
 * A chat turn must always terminate. Every step that waits on something outside
 * this process — an LLM stream, a tool hitting a third-party API, a whois/DNS
 * socket — is wrapped so that a peer which never answers surfaces as a timeout
 * we can report instead of a turn that hangs forever behind a spinner.
 *
 * Timeouts are layered on purpose, innermost first, so the innermost one
 * normally fires and produces the most specific message:
 *   fetch timeout  <  tool timeout  <  LLM turn timeout  <  whole-run deadline
 */

import { serverEnv } from './serverEnv';

/** Whole agent run, from request to final reply. */
const DEFAULT_RUN_TIMEOUT_MS = 9 * 60_000;
/** One LLM request/stream (a single "round" of the tool loop). */
const DEFAULT_LLM_TURN_TIMEOUT_MS = 3 * 60_000;
/** One tool call, unless overridden below. */
const DEFAULT_TOOL_TIMEOUT_MS = 90_000;

/**
 * Tools known to be legitimately slow. Each still needs a ceiling — the point
 * is that the ceiling exists, not that it is tight.
 */
const TOOL_TIMEOUT_OVERRIDES_MS: Record<string, number> = {
  lighthouse_audit: 150_000,
  check_links: 120_000,
  dns_check: 60_000,
  ssl_check: 60_000,
  fetch_url: 45_000,
  brave_search: 45_000,
  exec_command: 180_000,
  run_terminal_command: 60_000,
  run_dev_task: 120_000,
  write_github_file: 90_000,
  sync_resend_dns: 120_000,
  sync_vapi_assistant: 90_000,
  sync_uptimerobot: 90_000,
  backup_kinsta_site: 180_000,
  create_kinsta_site: 180_000,
};

/**
 * Tools that only read: safe to execute concurrently when the model asks for
 * several in one turn, because they cannot interfere with each other or care
 * about ordering. Anything that writes (files, commits, invoices, mail, DNS,
 * contacts, hosting) is absent on purpose and stays strictly sequential.
 *
 * This is what makes a full site audit finish in the time of its slowest check
 * instead of the sum of all of them — and makes the model's own narration
 * ("running the remaining audit tools in parallel") actually true.
 */
const READ_ONLY_TOOLS = new Set([
  // Site audits and research
  'fetch_url',
  'lighthouse_audit',
  'ssl_check',
  'check_links',
  'dns_check',
  'brave_search',
  'detect_tech_stack',
  'get_site_monitoring',
  // Knowledge and project reads
  'list_knowledge',
  'read_knowledge',
  'search_knowledge',
  'list_work',
  'read_work',
  'list_project_files',
  'get_work_invoice_suggestions',
  // Contacts and portals
  'list_contacts',
  'resolve_contact',
  'get_client_portal',
  'get_client_submit_link',
  // To-dos, mail, scheduling
  'list_todos',
  'list_email_inbox',
  'read_email_inbox',
  'list_email_filter_rules',
  'list_bookings',
  'get_booking',
  'get_booking_link',
  // Billing reads
  'list_recent_invoices',
  'list_recurring_invoices',
  'get_invoice',
  'search_customers',
  'search_line_items',
  // Dev/infra reads
  'get_git_status',
  'get_recent_commits',
  'check_deployment_status',
  'list_open_branches',
  'list_railway_domains',
  'list_kinsta_sites',
  'list_kinsta_backups',
  'get_kinsta_operation',
  'list_files',
  'read_file',
  'grep_code',
  'run_terminal_command',
]);

/**
 * Whether a batch of tool calls from a single turn can run concurrently. All of
 * them must be read-only: one write in the batch and the whole batch runs in
 * order, since the model may well be relying on that order.
 */
export function canRunToolsConcurrently(names: string[]): boolean {
  return names.length > 1 && names.every((name) => READ_ONLY_TOOLS.has(name));
}

export class AgentTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly label: string;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${formatSeconds(timeoutMs)}`);
    this.name = 'AgentTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function isAgentTimeoutError(err: unknown): err is AgentTimeoutError {
  return err instanceof AgentTimeoutError || (err as { name?: string })?.name === 'AgentTimeoutError';
}

export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function formatSeconds(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function envMs(name: string, fallback: number, min = 5_000): number {
  const raw = serverEnv(name)?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= min) return Math.floor(n);
  }
  return fallback;
}

export function agentRunTimeoutMs(): number {
  return envMs('AGENT_RUN_TIMEOUT_MS', DEFAULT_RUN_TIMEOUT_MS, 30_000);
}

export function agentLlmTurnTimeoutMs(): number {
  return envMs('AGENT_LLM_TURN_TIMEOUT_MS', DEFAULT_LLM_TURN_TIMEOUT_MS, 15_000);
}

export function agentToolTimeoutMs(toolName?: string): number {
  const base = envMs('AGENT_TOOL_TIMEOUT_MS', DEFAULT_TOOL_TIMEOUT_MS, 5_000);
  const override = toolName ? TOOL_TIMEOUT_OVERRIDES_MS[toolName] : undefined;
  return Math.max(base, override ?? 0);
}

/**
 * Reject with `AgentTimeoutError` if `promise` has not settled within `ms`.
 *
 * The losing side is always given a no-op catch: a wedged promise that rejects
 * an hour later must not surface as an unhandled rejection and take the process
 * down with it.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    promise.catch(() => {});
    return Promise.reject(new AgentTimeoutError(label, Math.max(0, ms)));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    // Deliberately not unref'd: a deadline that the event loop is allowed to
    // skip is no deadline at all. Every one of these is cleared the moment the
    // promise settles, so it can only ever hold the process for its own window.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new AgentTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Like `withDeadline`, but resolves with `onTimeout(err)` instead of rejecting. */
export async function withDeadlineFallback<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout: (err: AgentTimeoutError) => T,
): Promise<T> {
  try {
    return await withDeadline(promise, ms, label);
  } catch (err) {
    if (isAgentTimeoutError(err)) return onTimeout(err);
    throw err;
  }
}

/**
 * Wrap a single tool invocation so the agent loop can always make progress.
 *
 * The loop is blocked until every `tool_use` block has a matching `tool_result`,
 * so this guarantees `dispatch` produces a string, and produces one within
 * `timeoutMs` no matter how badly the tool or its upstream misbehaves. Genuine
 * cancellation (the user pressed Stop) is the one thing allowed through.
 */
export async function guardToolCall(
  name: string,
  timeoutMs: number,
  dispatch: () => Promise<string>,
): Promise<string> {
  try {
    return await withDeadline(dispatch(), timeoutMs, `Tool ${name}`);
  } catch (err) {
    if (isAgentTimeoutError(err)) {
      return JSON.stringify({
        error: `${name} timed out after ${formatSeconds(timeoutMs)} and was abandoned`,
        timed_out: true,
        tool: name,
        hint: 'The upstream service did not respond. Report this to the user and continue with the other steps — do not retry the same call more than once.',
      });
    }
    if (isAbortError(err)) throw err;
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
      tool: name,
    });
  }
}

export type AgentDeadline = {
  /** Milliseconds left before the run must be finished. Never negative. */
  remainingMs(): number;
  expired(): boolean;
  /** `ms` clamped to whatever time the run has left. */
  clamp(ms: number): number;
  totalMs: number;
  startedAt: number;
};

export function createAgentDeadline(totalMs = agentRunTimeoutMs()): AgentDeadline {
  const startedAt = Date.now();
  const endsAt = startedAt + totalMs;
  return {
    startedAt,
    totalMs,
    remainingMs: () => Math.max(0, endsAt - Date.now()),
    expired: () => Date.now() >= endsAt,
    clamp: (ms: number) => Math.max(0, Math.min(ms, endsAt - Date.now())),
  };
}

/**
 * `fetch` that always has a ceiling, and that still aborts when an outer signal
 * (the run's "Stop") fires. Used by tool clients so the underlying socket is
 * actually torn down rather than merely abandoned.
 */
export async function fetchWithDeadline(
  input: string | URL,
  init: RequestInit & { timeoutMs?: number; signal?: AbortSignal | null } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new AgentTimeoutError('Request', timeoutMs)),
    timeoutMs,
  );
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
