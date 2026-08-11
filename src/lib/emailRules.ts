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

export interface EmailRule {
  /** Short status label surfaced in the notification, e.g. "DOWN". */
  status: string;
  description?: string;
  /** Case-insensitive substrings; matched against the selected `fields`. */
  phrases: string[];
  /** "any" = at least one phrase, "all" = every phrase. */
  matchMode: MatchMode;
  fields: RuleField[];
  /** Whether a match should send a push/inbox alert. */
  notify: boolean;
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
    summaryOverride: 'Verification code — tap the push notification to copy.',
  },

  // ── 0b. AUTH / MAGIC LINKS (global — never junk) ────────────────────────

  {
    status: AUTH_LINK_STATUS,
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
    status: 'RECEIPT',
    description:
      'Expense tax receipts (you paid / your receipt) — auto-file silently. Not income like “Payment of $… from …”.',
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
    description: 'Marketing trash — file silently, no alert.',
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
 * When no rule matches, should the owner still be notified? Defaults to true so
 * nothing slips through silently while rules are being tuned.
 */
export const NOTIFY_ON_UNMATCHED = true;

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

function ruleMatches(rule: EmailRule, email: InboundEmail): boolean {
  if (!rule.enabled) return false;
  if (isVerificationCodeRuleStatus(rule.status)) {
    return matchesVerificationCodeRule(rule, email);
  }
  if (isAuthLinkRuleStatus(rule.status)) {
    return matchesAuthLinkRule(rule, email);
  }
  if (rule.phrases.length === 0) return false;
  const haystack = rule.fields.map((f) => fieldValue(email, f).toLowerCase()).join('\n');
  const hits = rule.phrases.map((p) => haystack.includes(p.toLowerCase()));
  return rule.matchMode === 'all' ? hits.every(Boolean) : hits.some(Boolean);
}

/** Whether inbound mail is a UptimeRobot notification (email path — webhooks are preferred). */
export function isUptimeRobotEmail(
  email: Pick<InboundEmail, 'from' | 'subject' | 'text'>,
): boolean {
  const hay = `${email.from}\n${email.subject}\n${email.text}`.toLowerCase();
  return hay.includes('uptimerobot') || hay.includes('is down') || hay.includes('monitor is down');
}

/**
 * Classify an inbound email against the rule table.
 * First matching enabled rule (in table / sort order) wins; evaluation stops.
 */
export function classifyEmail(
  email: InboundEmail,
  rules: EmailRule[] = DEFAULT_RULES,
  notifyOnUnmatched: boolean = NOTIFY_ON_UNMATCHED
): Classification {
  // Global OTP rule — always first, regardless of persisted sort_order.
  const verificationRule = rules.find(
    (r) => r.enabled && isVerificationCodeRuleStatus(r.status),
  );
  if (verificationRule && matchesVerificationCodeRule(verificationRule, email)) {
    return {
      status: verificationRule.status,
      matched: verificationRule,
      notify: verificationRule.notify,
    };
  }

  // Global auth-link rule — before DELETE/junk (footers often match unsubscribe).
  const authLinkRule = rules.find((r) => r.enabled && isAuthLinkRuleStatus(r.status));
  if (authLinkRule && matchesAuthLinkRule(authLinkRule, email)) {
    return {
      status: authLinkRule.status,
      matched: authLinkRule,
      notify: authLinkRule.notify,
    };
  }

  for (const rule of rules) {
    if (isVerificationCodeRuleStatus(rule.status) || isAuthLinkRuleStatus(rule.status)) continue;
    if (ruleMatches(rule, email)) {
      // Short-circuit: do not evaluate remaining rules.
      return { status: rule.status, matched: rule, notify: rule.notify };
    }
  }
  return { status: 'UNMATCHED', matched: null, notify: notifyOnUnmatched };
}

/** True when a matched rule means silent file/junk — no dashboard or push. */
export function isSilentTriageStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'DELETE' || s === 'JUNK' || s === 'AUTO_ARCHIVED' || s === 'RECEIPT';
}
