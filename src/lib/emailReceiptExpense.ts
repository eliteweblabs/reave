/**
 * Dashboard notifications for inbound tax receipts → Crater expenses.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import {
  extractMonetaryAmountFromEmail,
  formatUsdAmount,
  looksLikeIncomingPayment,
} from './emailMoney';
import { parseSenderEmail, parseSenderName } from './emailAddress';
import { brandDomainFromSenderEmail } from './notificationFormat';
import {
  explainReceiptClassification,
  type ClassificationAuditStep,
} from './emailClassificationAudit';

export type ReceiptExpenseReviewNotification = {
  id: string;
  type: 'receipt_expense';
  title: string;
  detail: string;
  subject: string;
  from: string;
  receivedAt: string;
  emailId: string;
  amount: number | null;
  vendorLabel: string;
  awaitingTriage: false;
  /** Decision path that produced the Tax receipt classification / title. */
  auditTrail: ClassificationAuditStep[];
};

function isReceiptArchived(record: Pick<EmailInboxRecord, 'action' | 'status'>): boolean {
  const action = String(record.action || '').toLowerCase();
  const status = String(record.status || '').toLowerCase();
  return action === 'filed' || status === 'filed';
}

/** Receipt filed in inbox but not yet acknowledged on the dashboard. */
export function isReceiptPendingExpenseReview(
  record: Pick<
    EmailInboxRecord,
    | 'category'
    | 'action'
    | 'status'
    | 'automationAckAt'
    | 'automationKind'
    | 'from'
    | 'subject'
    | 'summary'
    | 'bodySnippet'
    | 'bodyText'
  >,
): boolean {
  if (record.category !== 'receipt') return false;
  if (extractMonetaryAmountFromEmail(record) == null) return false;
  if (record.automationAckAt) return false;
  if (record.automationKind === 'expense_created') return false;
  if (isReceiptArchived(record)) return false;
  if (looksLikeMisfiledReceipt(record)) return false;
  return true;
}

/**
 * Why POST /expense should refuse this row, or null if logging is allowed.
 * Explicit Expense taps use this — not the banner gate — so a receipt that
 * still shows “Expense” is not rejected because the full body contains a
 * generic “Payment of $…” phrase (common on vendor receipts).
 */
export function receiptExpenseLogError(
  record: Pick<EmailInboxRecord, 'category' | 'automationKind' | 'from' | 'subject' | 'summary' | 'bodySnippet' | 'bodyText'>,
): string | null {
  if (record.automationKind === 'expense_created') {
    return 'This receipt was already logged as a Crater expense';
  }
  if (record.category !== 'receipt') {
    return 'This message is not filed as a tax receipt';
  }
  if (extractMonetaryAmountFromEmail(record) == null) {
    return 'No dollar amount detected on this receipt email';
  }
  if (looksLikeIncomingPayment(record)) {
    return 'This looks like incoming payment (income), not an expense receipt';
  }
  return null;
}

/**
 * Mis-tagged as receipt — skip the Tax receipt → Expense banner.
 * Only strong income language (“Payment of $… from …”) hides the banner.
 * `looksLikePaymentNotification` is too broad (“Payment of $…” appears on
 * real vendor receipts) and the dashboard list often lacks full body text,
 * so using it here made Expense fail after the banner was already shown.
 */
function looksLikeMisfiledReceipt(
  record: Pick<EmailInboxRecord, 'from' | 'subject' | 'summary' | 'bodySnippet' | 'bodyText'>,
): boolean {
  if (looksLikeIncomingPayment(record)) return true;
  if (extractMonetaryAmountFromEmail(record) != null) return false;
  const blob = [record.subject, record.summary].join(' ').toLowerCase();
  return /\b(build failed|deploy failed|deployment failed|railway|ci failed)\b/.test(blob);
}

const GENERIC_SENDER_LOCAL_PARTS = new Set([
  'notifications',
  'notification',
  'noreply',
  'no-reply',
  'mail',
  'email',
  'alerts',
  'notify',
  'messaging',
  'info',
  'support',
  'hello',
  'e',
  'm',
]);

export function receiptVendorLabel(record: Pick<EmailInboxRecord, 'from' | 'subject'>): string {
  const from = record.from || '';
  const name = parseSenderName(from);
  if (name) return name;
  const email = parseSenderEmail(from);
  if (email) {
    const [local, domain] = email.split('@');
    if (local && domain && GENERIC_SENDER_LOCAL_PARTS.has(local.toLowerCase())) {
      const brand = brandDomainFromSenderEmail(from);
      if (brand) {
        const root = brand.split('.')[0];
        if (root) return root.charAt(0).toUpperCase() + root.slice(1);
      }
      return email;
    }
    return local?.replace(/[._-]+/g, ' ').trim() || email;
  }
  const subject = (record.subject || '').trim();
  if (subject) return subject.slice(0, 48);
  return 'Vendor';
}

export function receiptExpenseTitle(record: EmailInboxRecord): string {
  const amount = extractMonetaryAmountFromEmail(record);
  if (amount != null) return `Tax receipt — ${formatUsdAmount(amount)}`;
  return 'Tax receipt ready to log';
}

export function receiptExpenseDetail(record: EmailInboxRecord): string {
  const vendor = receiptVendorLabel(record);
  const subject = (record.subject || '').trim() || '(no subject)';
  return `${vendor} · ${subject}`;
}

export function toReceiptExpenseReviewNotification(
  record: EmailInboxRecord,
): ReceiptExpenseReviewNotification {
  return {
    id: record.id,
    type: 'receipt_expense',
    title: receiptExpenseTitle(record),
    detail: receiptExpenseDetail(record),
    subject: record.subject || '(no subject)',
    from: record.from || '',
    receivedAt: record.receivedAt,
    emailId: record.id,
    amount: extractMonetaryAmountFromEmail(record),
    vendorLabel: receiptVendorLabel(record),
    awaitingTriage: false,
    auditTrail: explainReceiptClassification(record),
  };
}

export function listReceiptExpenseNotifications(
  events: EmailInboxRecord[],
  opts?: { limit?: number; maxAgeDays?: number },
): ReceiptExpenseReviewNotification[] {
  const limit = opts?.limit ?? 8;
  const maxAgeMs = (opts?.maxAgeDays ?? 7) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  return events
    .filter((e) => isReceiptPendingExpenseReview(e))
    .filter((e) => new Date(e.receivedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, limit)
    .map(toReceiptExpenseReviewNotification);
}

export function buildCraterExpenseFromEmail(record: EmailInboxRecord): {
  amount: number;
  expenseDate: string;
  categoryName: string;
  notes: string;
} {
  const amount = extractMonetaryAmountFromEmail(record);
  if (amount == null || amount <= 0) {
    throw new Error('Could not detect a dollar amount on this receipt email');
  }
  const received = new Date(record.receivedAt);
  const expenseDate = Number.isFinite(received.getTime())
    ? received.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const vendor = receiptVendorLabel(record);
  const subject = (record.subject || '').trim();
  const notes = [vendor, subject, record.id ? `Inbox ${record.id}` : '']
    .filter(Boolean)
    .join(' · ');
  return {
    amount,
    expenseDate,
    categoryName: 'Business Expense',
    notes,
  };
}
