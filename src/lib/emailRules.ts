/**
 * Email triage rule engine (Reave).
 *
 * Ported from the retired `openclaw-email-tools` IMAP monitor. Instead of
 * polling a mailbox, inbound mail now arrives via a Resend webhook
 * (`/api/email/inbound`). Each message is matched against keyword/phrase rules
 * that resolve to a `status` and decide whether to notify the owner (Web Push).
 *
 * Design goal: CONTENT-ONLY matching — no sender/domain phrases.
 * Sender-based rules do not scale; every new service needs a new rule.
 * Instead, rules match subject and body language so they generalise across
 * any sending address.
 * Known contacts are a junk green light: the catalog DELETE catch-all
 * (unsubscribe / opt-out) does not apply to senders in Contacts. Personal
 * sender DELETE rules still run and can junk.
 *
 * Triage is sequential priority — never parallel.
 * First enabled match wins; later rules are skipped (short-circuit).
 * `VERIFICATION_CODE` then `AUTH_LINK` are always evaluated first (regex via
 * emailOtpParser / emailAuthLinkParser) on every installation — even when
 * persisted sort order differs. Auth-link mail must never fall through to
 * DELETE/junk (footers often contain "unsubscribe") while still surfacing
 * as a dashboard Activate notification.
 * Keep high-signal operational alerts (RAILWAY, DOWN, NEEDS_CHECK) ABOVE
 * catch-all filing rules (RECEIPT, AUTO_ARCHIVED, DELETE) so a Railway build
 * failure is never silently mis-classified as a receipt.
 * Sender-specific silent rules (from-field DELETE / notify:false) are inserted
 * just after OTP/auth so they beat broad alert catch-alls — not the reverse.
 */

import { isAuthLinkEmail } from './emailAuthLinkParser';
import { isVerificationCodeEmail } from './emailOtpParser';

/** Built-in status for OTP / login-code mail (global on all installs). */
export const VERIFICATION_CODE_STATUS = 'VERIFICATION_CODE';

/** Built-in status for magic / activation / one-click sign-in link mail. */
export const AUTH_LINK_STATUS = 'AUTH_LINK';

export function isVerificationCodeRuleStatus(status: string): boolean {
  return status.toUpperCase() === VERIFICATION_CODE_STATUS;
}

export function isAuthLinkRuleStatus(status: string): boolean {
  return status.toUpperCase() === AUTH_LINK_STATUS;
}

export type MatchMode = 'any' | 'all';
export type RuleField = 'subject' | 'body' | 'from';
/** Where a rule applies: every Reave install (repo catalog) vs this install only. */
export type EmailRuleScope = 'universal' | 'personal';

export function normalizeEmailRuleScope(
  raw: unknown,
  fallback: EmailRuleScope = 'personal',
): EmailRuleScope {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'universal' || v === 'global' || v === 'shared' || v === 'all') return 'universal';
  if (v === 'personal' || v === 'local' || v === 'install') return 'personal';
  return fallback;
}

/** Action buttons on push / dashboard alerts for a matched rule. */
export type RuleNotifyAction =
  | 'view'
  | 'archive'
  | 'delete'
  | 'copy'
  | 'activate'
  | 'explain'
  | 'expense'
  | 'rules';

export const RULE_NOTIFY_ACTIONS: readonly RuleNotifyAction[] = [
  'view',
  'archive',
  'delete',
  'copy',
  'activate',
  'explain',
  'expense',
  'rules',
] as const;

export const RULE_NOTIFY_ACTION_LABELS: Record<RuleNotifyAction, string> = {
  view: 'View',
  archive: 'Archive',
  delete: 'Delete',
  copy: 'Copy code',
  activate: 'Activate',
  explain: 'Explain',
  expense: 'Expense',
  rules: 'Email Lab',
};

export interface EmailRule {
  /** Short status label surfaced in the notification, e.g. "DOWN". */
  status: string;
  /**
   * `universal` — repo catalog (`DEFAULT_RULES`). Same on every install; deploy
   * overwrites local copies. `personal` — this install only (teach/correct).
   */
  scope?: EmailRuleScope;
  description?: string;
  /** Case-insensitive substrings; matched against the selected `fields`. */
  phrases: string[];
  /**
   * Case-insensitive substrings that veto a match — if any appear in the
   * selected `fields`, the rule does not fire (NOT / except clause).
   */
  exceptPhrases?: string[];
  /** "any" = at least one phrase, "all" = every phrase. */
  matchMode: MatchMode;
  fields: RuleField[];
  /**
   * Legacy master switch — true when push and/or dashboard should fire.
   * Prefer `notifyPush` / `notifyDashboard`; kept in sync on save.
   */
  notify: boolean;
  /** Phone / PWA push notification. Defaults to `notify` when unset. */
  notifyPush?: boolean;
  /** Dismissible dashboard review banner. Defaults to `notify` when unset. */
  notifyDashboard?: boolean;
  /**
   * Buttons on the resulting alert. Empty/omitted → status-based defaults
   * (OTP → Copy+Delete, auth → Activate+Delete, else View+Archive).
   */
  notifyActions?: RuleNotifyAction[];
  enabled: boolean;
  /**
   * Canned one-line summary used for the notification/summary when no better
   * summary is available (e.g. AI triage is disabled or fails). Lets known,
   * boilerplate-heavy alerts show a clean TL;DR instead of a raw text snippet.
   */
  summaryOverride?: string;
  /**
   * Optional email address to forward the matched message to automatically.
   * The full original message (from, subject, body) is re-sent to this address
   * via Resend immediately after the rule fires — before any inbox logging.
   * Useful for platform notifications (e.g. Upwork) you want silently relayed
   * to a team member or secondary inbox.
   */
  forwardTo?: string | null;
  /**
   * When a rule forwards mail (`forwardTo` is set), auto-create project is
   * skipped unless this is true. Default false — relay-only.
   */
  createProject?: boolean;
}

export interface InboundEmail {
  from: string;
  subject: string;
  text: string;
  html?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  headers?: Record<string, string>;
  messageId?: string;
  resendEmailId?: string;
  /** Attachment metadata from Resend (id, filename, content type, size). */
  attachments?: import('./emailAttachments').EmailAttachmentMeta[];
}

export interface Classification {
  /** Resolved status, or "UNMATCHED" when no enabled rule matched. */
  status: string;
  matched: EmailRule | null;
  notify: boolean;
}

/**
 * Default rule table.
 *
 * Ordering principle:
 *   0. Verification codes  — OTP / login codes (regex; always checked first)
 *   0b. Auth / magic links — activation & one-click sign-in (before junk)
 *   1. Operational alerts  — Railway, uptime, security (must not be buried)
 *   2. Auto-filing         — receipts, Google invoices
 *   3. Delete/junk         — marketing trash (last resort)
 *
 * NO sender/domain phrases (e.g. "stripe.com", "notify@stripe.com",
 * "alert@uptimerobot.com"). Those break whenever a vendor changes their
 * sending address and produce false positives on unrelated mail. Use
 * subject/body language instead — it generalises to any sending address.
 */
export const DEFAULT_RULES: EmailRule[] = [
  // ── 0. VERIFICATION CODES (global — all clients / all installs) ─────────

  {
    status: VERIFICATION_CODE_STATUS,
    scope: 'universal',
    description:
      'One-time passwords and login codes — regex match on subject/body (OTP, verification code, access code, 4–8 digit codes). Copy-to-clipboard UX in the Email tab; auto-deleted after 5 minutes; not overridden by junk or security-alert rules.',
    phrases: [
      'verification code',
      'one-time password',
      'one-time code',
      'security code',
      'login code',
      'sign-in code',
      'access code',
      'authentication code',
      'confirmation code',
      'otp',
      'passcode',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
    summaryOverride: 'Verification code — tap the push notification to copy to the clipboard.',
  },

  // ── 0b. AUTH / MAGIC LINKS (global — never junk) ────────────────────────

  {
    status: AUTH_LINK_STATUS,
    scope: 'universal',
    description:
      'Magic sign-in / activation / one-click login links — CTA URL scraped for dashboard Activate; auto-deleted after use or TTL; never filed as junk (transactional footers often match DELETE).',
    phrases: [
      'magic sign-in link',
      'magic link',
      'activation link',
      'secure link to',
      'sign-in link',
      'login link',
      'click to sign in',
      'click to login',
      'click to log in',
      'activate your account',
      'one-click sign-in',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
    summaryOverride: 'Activation link — tap Activate on the dashboard notification.',
  },

  // ── 1. OPERATIONAL ALERTS ───────────────────────────────────────────────

  {
    status: 'ANTHROPIC_BILLING',
    scope: 'universal',
    description:
      'Anthropic/Claude API disabled for lack of usage credits — also means AI email triage/summaries are degraded until fixed. Canned summary avoids dumping the raw boilerplate email as the notification preview.',
    phrases: [
      'Claude API access is turned off',
      'access to the Claude API has been disabled',
      'is out of usage credits',
      'out of usage credits',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
    summaryOverride:
      'Claude API access is off — Anthropic org is out of usage credits. Add credits at console.anthropic.com/settings/billing to restore AI email triage.',
  },

  {
    status: 'RAILWAY_ALERT',
    scope: 'universal',
    description: 'Railway deploy/build failures — inbox alert, high priority.',
    phrases: [
      'Build failed for',
      'Build failed!',
      'Deployment crashed',
      'Uh oh. Your deployment',
      'crashed within the production environment',
      'failed to leave the wheelhouse',
      'railway.app',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
  },

  {
    status: 'DOWN',
    scope: 'universal',
    description: 'Uptime/monitoring alerts — website or service down.',
    phrases: [
      'UptimeRobot',
      'is DOWN',
      'monitor is down',
      'uptime alert',
      'site is down',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
  },

  {
    status: 'NEEDS_CHECK',
    scope: 'universal',
    description:
      'Security and auth alerts — flag for review. Deliberately omits bare "Security alert" so Google Account sign-in notices can be auto-junked by a sender-specific DELETE rule without fighting this catch-all.',
    phrases: [
      'sign in was removed',
      'App password used',
      'unusual sign-in',
      'suspicious activity',
      'your account was accessed',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
  },

  // ── 2. AUTO-FILING ───────────────────────────────────────────────────────

  {
    status: 'AUTO_ARCHIVED',
    scope: 'universal',
    description:
      'Shipment tracked — package/order shipping notices. Auto-archive silently; not a tax receipt.',
    phrases: [
      'shipment tracked',
      'shipment tracking',
      'shipment-tracking',
      'your order has shipped',
      'your package has shipped',
      'your package was shipped',
    ],
    matchMode: 'any',
    fields: ['subject', 'body', 'from'],
    notify: false,
    enabled: true,
  },

  {
    status: 'RECEIPT',
    scope: 'universal',
    description:
      'Expense tax receipts (you paid / your receipt) — auto-file silently. Not income like "Payment of $… from …".',
    phrases: [
      'payment confirmation',
      'payment receipt',
      'Your receipt from',
      'You paid',
      'Amount paid',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: false,
    enabled: true,
  },

  {
    status: 'AUTO_ARCHIVED',
    scope: 'universal',
    description: 'Routine vendor invoices — file silently, no alert.',
    phrases: [
      'Your Google Workspace monthly invoice',
      'Your monthly invoice',
    ],
    matchMode: 'any',
    fields: ['subject'],
    notify: false,
    enabled: true,
  },

  // ── 3. DELETE / JUNK ─────────────────────────────────────────────────────

  {
    status: 'DELETE',
    scope: 'universal',
    description:
      'New sign-in / new device notifications — sent by GoDaddy, Google, Apple, and other platforms whenever a login is detected. Pure notification spam with no actionable content; silently deleted on every install.',
    phrases: [
      "There's been a new sign-in",
      'signed in to your account',
      'new sign-in to your account',
      'Someone signed in to your account',
      'signed in from a new device',
      'signed in from a new location',
      'new device sign-in',
      'new location or device',
    ],
    exceptPhrases: [
      'unusual sign-in',
      'suspicious activity',
      'your account may be compromised',
      'reset your password',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: false,
    enabled: true,
  },

  {
    status: 'DELETE',
    scope: 'universal',
    description:
      'Marketing trash — file silently, no alert. Does not apply to known contacts (personal sender DELETE rules still can).',
    phrases: [
      'unsubscribe',
      'you received this because',
      'manage your email preferences',
      'opt out',
    ],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: false,
    enabled: true,
  },
];

/**
 * Unmatched mail stays in the inbox only — no dashboard notice and no agent
 * chat. The stored `notify_on_unmatched` flag is ignored so one message is not
 * handled three times (inbox + notice + agentic chat).
 */
export const NOTIFY_ON_UNMATCHED = false;

/** Statuses that live in `DEFAULT_RULES` and ship to every install on deploy. */
export function isRepoCatalogStatus(status: string): boolean {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  return DEFAULT_RULES.some((d) => d.status.toUpperCase() === key);
}

/**
 * Repo catalog row (not a personal rule that happens to share a status like DELETE).
 * Catalog defaults never search `from` — those are install-local sender blocks.
 */
export function isRepoCatalogRule(rule: {
  status?: string;
  scope?: string | null;
  fields?: readonly string[] | null;
}): boolean {
  if (normalizeEmailRuleScope(rule.scope, 'personal') !== 'universal') return false;
  if (!isRepoCatalogStatus(String(rule.status || ''))) return false;
  return !(rule.fields || []).includes('from');
}

/**
 * Universal catalog junk catch-all (unsubscribe / opt-out). Known contacts
 * skip this rule so product mail from Cursor, Railway, etc. is not hidden
 * just because the footer says "unsubscribe". Personal `from` DELETE rules
 * are not catalog rows and still apply.
 */
export function isCatalogMarketingDeleteRule(rule: {
  status?: string;
  scope?: string | null;
  fields?: readonly string[] | null;
}): boolean {
  const s = String(rule.status || '')
    .trim()
    .toUpperCase();
  if (s !== 'DELETE' && s !== 'JUNK') return false;
  return isRepoCatalogRule(rule);
}

function fieldValue(email: InboundEmail, field: RuleField): string {
  switch (field) {
    case 'subject':
      return email.subject;
    case 'body':
      return email.text;
    case 'from':
      return email.from;
    default:
      return '';
  }
}

function matchesVerificationCodeRule(rule: EmailRule, email: InboundEmail): boolean {
  if (!rule.enabled || !isVerificationCodeRuleStatus(rule.status)) return false;
  return isVerificationCodeEmail({
    from: email.from,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

function matchesAuthLinkRule(rule: EmailRule, email: InboundEmail): boolean {
  if (!rule.enabled || !isAuthLinkRuleStatus(rule.status)) return false;
  return isAuthLinkEmail({
    from: email.from,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

function ruleHaystack(rule: EmailRule, email: InboundEmail): string {
  return rule.fields.map((f) => fieldValue(email, f).toLowerCase()).join('\n');
}

function normalizePhraseList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => String(p).trim()).filter(Boolean);
}

/** Phrases from `exceptPhrases` that appear in the rule's selected fields. */
export function blockedByExceptPhrases(rule: EmailRule, email: InboundEmail): string[] {
  const except = normalizePhraseList(rule.exceptPhrases);
  if (!except.length) return [];
  const haystack = ruleHaystack(rule, email);
  return except.filter((p) => haystack.includes(p.toLowerCase()));
}

function ruleMatches(rule: EmailRule, email: InboundEmail): boolean {
  if (!rule.enabled) return false;
  if (isVerificationCodeRuleStatus(rule.status)) {
    if (!matchesVerificationCodeRule(rule, email)) return false;
    return blockedByExceptPhrases(rule, email).length === 0;
  }
  if (isAuthLinkRuleStatus(rule.status)) {
    if (!matchesAuthLinkRule(rule, email)) return false;
    return blockedByExceptPhrases(rule, email).length === 0;
  }
  if (rule.phrases.length === 0) return false;
  const haystack = ruleHaystack(rule, email);
  const hits = rule.phrases.map((p) => haystack.includes(p.toLowerCase()));
  const positive = rule.matchMode === 'all' ? hits.every(Boolean) : hits.some(Boolean);
  if (!positive) return false;
  return blockedByExceptPhrases(rule, email).length === 0;
}

/** Whether inbound mail is a UptimeRobot notification (email path — webhooks are preferred). */
export function isUptimeRobotEmail(
  email: Pick<InboundEmail, 'from' | 'subject' | 'text'>,
): boolean {
  const hay = `${email.from}\n${email.subject}\n${email.text}`.toLowerCase();
  return hay.includes('uptimerobot') || hay.includes('is down') || hay.includes('monitor is down');
}

/** Per-rule outcome while walking the priority ladder (first match wins). */
export type RuleEvaluationOutcome =
  | 'matched'
  | 'no_match'
  | 'skipped_after_match'
  | 'skipped_known_contact'
  | 'disabled'
  | 'pinned_checked';

export type EvaluateEmailRulesOptions = {
  /** Sender is in Contacts — catalog marketing DELETE does not apply. */
  knownContact?: boolean;
};

export type RuleEvaluation = {
  rule: EmailRule;
  /** Index in the evaluation walk (OTP/auth may appear before table order). */
  order: number;
  outcome: RuleEvaluationOutcome;
};

export type RuleEvaluationResult = {
  classification: Classification;
  evaluations: RuleEvaluation[];
};

/**
 * Walk the rule table exactly as production triage does and record every rule's
 * outcome. OTP then AUTH_LINK are always checked first (pinned); remaining
 * enabled rules follow array / sort order; first match short-circuits.
 */
export function evaluateEmailRules(
  email: InboundEmail,
  rules: EmailRule[] = DEFAULT_RULES,
  /** Kept for call-site compatibility; unmatched mail never notifies. */
  notifyOnUnmatched: boolean = NOTIFY_ON_UNMATCHED,
  options?: EvaluateEmailRulesOptions,
): RuleEvaluationResult {
  void notifyOnUnmatched;
  const evaluations: RuleEvaluation[] = [];
  let order = 0;
  let matched: EmailRule | null = null;

  const pushEval = (rule: EmailRule, outcome: RuleEvaluationOutcome) => {
    evaluations.push({ rule, order: order++, outcome });
  };

  // Global OTP rule — always first, regardless of persisted sort_order.
  const verificationRule = rules.find(
    (r) => r.enabled && isVerificationCodeRuleStatus(r.status),
  );
  if (verificationRule) {
    if (ruleMatches(verificationRule, email)) {
      pushEval(verificationRule, 'matched');
      matched = verificationRule;
    } else {
      pushEval(verificationRule, 'pinned_checked');
    }
  }

  // Global auth-link rule — before DELETE/junk (footers often match unsubscribe).
  const authLinkRule = rules.find((r) => r.enabled && isAuthLinkRuleStatus(r.status));
  if (!matched && authLinkRule) {
    if (ruleMatches(authLinkRule, email)) {
      pushEval(authLinkRule, 'matched');
      matched = authLinkRule;
    } else {
      pushEval(authLinkRule, 'pinned_checked');
    }
  } else if (matched && authLinkRule) {
    pushEval(authLinkRule, 'skipped_after_match');
  }

  for (const rule of rules) {
    if (isVerificationCodeRuleStatus(rule.status) || isAuthLinkRuleStatus(rule.status)) {
      // Already recorded in the pinned pass (or disabled / missing from pin find).
      if (
        !evaluations.some(
          (e) =>
            e.rule === rule ||
            (e.rule.status === rule.status &&
              e.rule.phrases.join('\0') === rule.phrases.join('\0')),
        )
      ) {
        pushEval(rule, rule.enabled ? 'skipped_after_match' : 'disabled');
      }
      continue;
    }
    if (matched) {
      pushEval(rule, rule.enabled ? 'skipped_after_match' : 'disabled');
      continue;
    }
    if (!rule.enabled) {
      pushEval(rule, 'disabled');
      continue;
    }
    if (options?.knownContact && isCatalogMarketingDeleteRule(rule)) {
      pushEval(rule, ruleMatches(rule, email) ? 'skipped_known_contact' : 'no_match');
      continue;
    }
    if (ruleMatches(rule, email)) {
      pushEval(rule, 'matched');
      matched = rule;
    } else {
      pushEval(rule, 'no_match');
    }
  }

  const classification: Classification = matched
    ? {
        status: matched.status,
        matched,
        notify: resolveRuleNotifyChannels(matched).notify,
      }
    : { status: 'UNMATCHED', matched: null, notify: false };

  return { classification, evaluations };
}

/**
 * Classify an inbound email against the rule table.
 * First matching enabled rule (in table / sort order) wins; evaluation stops.
 */
export function classifyEmail(
  email: InboundEmail,
  rules: EmailRule[] = DEFAULT_RULES,
  notifyOnUnmatched: boolean = NOTIFY_ON_UNMATCHED,
  options?: EvaluateEmailRulesOptions,
): Classification {
  return evaluateEmailRules(email, rules, notifyOnUnmatched, options).classification;
}

/** True when a matched rule means silent file/junk — no dashboard or push. */
export function isSilentTriageStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'DELETE' || s === 'JUNK' || s === 'AUTO_ARCHIVED' || s === 'RECEIPT';
}

export function normalizeNotifyActions(raw: unknown): RuleNotifyAction[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(RULE_NOTIFY_ACTIONS);
  const out: RuleNotifyAction[] = [];
  for (const item of raw) {
    const key = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const mapped =
      key === 'copy_code' || key === 'copy-code'
        ? 'copy'
        : key === 'open'
          ? 'view'
          : key;
    if (!allowed.has(mapped)) continue;
    if (!out.includes(mapped as RuleNotifyAction)) out.push(mapped as RuleNotifyAction);
  }
  return out;
}

export function defaultNotifyActionsForRule(rule: Pick<EmailRule, 'status'>): RuleNotifyAction[] {
  if (isVerificationCodeRuleStatus(rule.status)) return ['copy', 'delete'];
  if (isAuthLinkRuleStatus(rule.status)) return ['activate', 'delete'];
  if (String(rule.status || '').toUpperCase() === 'RECEIPT') return ['expense', 'archive'];
  return ['view', 'archive'];
}

export function resolveRuleNotifyActions(
  rule: EmailRule | null | undefined,
): RuleNotifyAction[] {
  if (!rule) return ['view', 'archive'];
  if (Array.isArray(rule.notifyActions) && rule.notifyActions.length) {
    return normalizeNotifyActions(rule.notifyActions);
  }
  return defaultNotifyActionsForRule(rule);
}

export function resolveRuleNotifyChannels(
  rule: EmailRule | null | undefined,
  fallbackNotify = false,
): { push: boolean; dashboard: boolean; notify: boolean } {
  if (!rule) {
    return { push: fallbackNotify, dashboard: fallbackNotify, notify: fallbackNotify };
  }
  const push = rule.notifyPush != null ? !!rule.notifyPush : !!rule.notify;
  const dashboard = rule.notifyDashboard != null ? !!rule.notifyDashboard : !!rule.notify;
  return { push, dashboard, notify: push || dashboard };
}

/** Sync legacy `notify` with channel flags for persistence. */
export function coalesceRuleNotifyFields(input: {
  notify?: boolean;
  notifyPush?: boolean | null;
  notifyDashboard?: boolean | null;
  notifyActions?: unknown;
}): {
  notify: boolean;
  notifyPush: boolean;
  notifyDashboard: boolean;
  notifyActions: RuleNotifyAction[];
} {
  const actions = normalizeNotifyActions(input.notifyActions);
  const push =
    input.notifyPush != null
      ? !!input.notifyPush
      : input.notify != null
        ? !!input.notify
        : false;
  const dashboard =
    input.notifyDashboard != null
      ? !!input.notifyDashboard
      : input.notify != null
        ? !!input.notify
        : false;
  return {
    notify: push || dashboard,
    notifyPush: push,
    notifyDashboard: dashboard,
    notifyActions: actions,
  };
}
