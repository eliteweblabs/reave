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
 * Rule order matters: first enabled match wins.
 * Keep high-signal operational alerts (RAILWAY, DOWN, NEEDS_CHECK) ABOVE
 * catch-all filing rules (RECEIPT, AUTO_ARCHIVED, DELETE) so a Railway build
 * failure is never silently mis-classified as a receipt.
 */

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
  // ── 1. OPERATIONAL ALERTS ───────────────────────────────────────────────

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
    description: 'Uptime/monitoring alerts — site or service down.',
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
    description: 'Security and auth alerts — flag for review.',
    phrases: [
      'Security alert',
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
    description: 'Payment confirmations and tax receipts — auto-file silently.',
    phrases: [
      'Payment of $',
      'payment confirmation',
      'payment receipt',
      'Your receipt from',
      'Your invoice from',
      'You paid',
      'Amount paid',
      'Transaction complete',
      'Order confirmation',
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

function ruleMatches(rule: EmailRule, email: InboundEmail): boolean {
  if (!rule.enabled || rule.phrases.length === 0) return false;
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
 * Classify an inbound email against the rule table. First matching enabled rule
 * (in table order) wins.
 */
export function classifyEmail(
  email: InboundEmail,
  rules: EmailRule[] = DEFAULT_RULES,
  notifyOnUnmatched: boolean = NOTIFY_ON_UNMATCHED
): Classification {
  for (const rule of rules) {
    if (ruleMatches(rule, email)) {
      return { status: rule.status, matched: rule, notify: rule.notify };
    }
  }
  return { status: 'UNMATCHED', matched: null, notify: notifyOnUnmatched };
}
