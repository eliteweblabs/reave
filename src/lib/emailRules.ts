/**
 * Email triage rule engine (Reave).
 *
 * Ported from the retired Email Tools IMAP monitor. Instead of
 * polling a mailbox, inbound mail now arrives via a Resend webhook
 * (`/api/email/inbound`). Each message is matched against keyword/phrase rules
 * that resolve to a `status` and decide whether to ping the Telegram bot.
 *
 * This is intentionally lightweight: no mailbox mutation (mark/archive/delete)
 * since Resend receiving is read-only — a rule only decides classification and
 * whether the owner is notified.
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
  /** Whether a match should send a Telegram alert. */
  notify: boolean;
  enabled: boolean;
}

export interface InboundEmail {
  from: string;
  subject: string;
  text: string;
}

export interface Classification {
  /** Resolved status, or "UNMATCHED" when no enabled rule matched. */
  status: string;
  matched: EmailRule | null;
  notify: boolean;
}

/**
 * Default rule table — ported from the Email Tools `status-rules.json` snapshot.
 * Edit here (or swap for a DB/JSON loader later) to tune triage.
 */
export const DEFAULT_RULES: EmailRule[] = [
  {
    status: 'DELETE',
    description: 'Clear marketing trash — file silently, no alert.',
    phrases: ['unsubscribe', 'you received this because'],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: false,
    enabled: true,
  },
  {
    status: 'AUTO_ARCHIVED',
    description: 'Google Workspace monthly invoices — file silently.',
    phrases: ['Your Google Workspace monthly invoice'],
    matchMode: 'any',
    fields: ['subject'],
    notify: false,
    enabled: true,
  },
  {
    status: 'DOWN',
    description: 'UptimeRobot down alert — real-time Telegram ping.',
    phrases: ['UptimeRobot'],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
    enabled: true,
  },
  {
    status: 'NEEDS_CHECK',
    description: 'Security alerts — flag for review.',
    phrases: ['Security alert', 'sign in was removed', 'App password used'],
    matchMode: 'any',
    fields: ['subject', 'body'],
    notify: true,
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

/**
 * Classify an inbound email against the rule table. First matching enabled rule
 * (in table order) wins.
 */
export function classifyEmail(
  email: InboundEmail,
  rules: EmailRule[] = DEFAULT_RULES
): Classification {
  for (const rule of rules) {
    if (ruleMatches(rule, email)) {
      return { status: rule.status, matched: rule, notify: rule.notify };
    }
  }
  return { status: 'UNMATCHED', matched: null, notify: NOTIFY_ON_UNMATCHED };
}
