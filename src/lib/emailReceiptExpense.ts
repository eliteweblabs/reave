/**
 * Dashboard notifications for inbound tax receipts → Crater expenses.
 */

import type { EmailInboxRecord } from './emailInboxStore';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from './emailMoney';
import { parseSenderEmail, parseSenderName } from './emailAddress';

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
    'category' | 'action' | 'status' | 'automationAckAt' | 'automationKind' | 'subject' | 'summary'
  >,
): boolean {
  if (record.category !== 'receipt') return false;
  if (record.automationAckAt) return false;
  if (record.automationKind === 'expense_created') return false;
  if (isReceiptArchived(record)) return false;
  if (looksLikeMisfiledReceipt(record)) return false;
  return true;
}

/** Alerts/deploy mail mis-tagged as receipt — skip dashboard banner when no dollar amount. */
function looksLikeMisfiledReceipt(
  record: Pick<EmailInboxRecord, 'subject' | 'summary'>,
): boolean {
  if (extractMonetaryAmountFromEmail(record) != null) return false;
  const blob = [record.subject, record.summary].join(' ').toLowerCase();
  return /\b(build failed|deploy failed|deployment failed|railway|ci failed)\b/.test(blob);
}

export function receiptVendorLabel(record: Pick<EmailInboxRecord, 'from' | 'subject'>): string {
  const name = parseSenderName(record.from || '');
  if (name) return name;
  const email = parseSenderEmail(record.from || '');
  if (email) return email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || email;
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
