/**
 * Detect dollar amounts in email text (receipts, invoices, payment confirmations).
 */

function parseDollarAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Best-effort monetary amount from free text (prefers total/paid/charge context). */
export function extractMonetaryAmountFromText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  type Scored = { amount: number; score: number; index: number };
  const scored: Scored[] = [];

  const add = (amount: number | null, score: number, index: number) => {
    if (amount != null && amount > 0) scored.push({ amount, score, index });
  };

  const contextual = [
    /(?:total|amount paid|paid|payment|charge(?:d)?|subtotal|balance due|you paid|grand total|order total|invoice(?:\s+(?:total|amount))?)[^$#]{0,36}\$\s*([\d,]+(?:\.\d{2})?)/gi,
    /\$\s*([\d,]+\.\d{2})\s*(?:\b(?:total|paid|usd)\b)/gi,
    /(?:receipt|transaction|purchase)[^$#]{0,36}\$\s*([\d,]+(?:\.\d{2})?)/gi,
  ];
  for (const re of contextual) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(t)) !== null) {
      add(parseDollarAmount(match[1]), 3, match.index);
    }
  }

  let match: RegExpExecArray | null;
  const dollarCents = /\$\s*([\d,]+\.\d{2})\b/g;
  while ((match = dollarCents.exec(t)) !== null) {
    add(parseDollarAmount(match[1]), 2, match.index);
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || a.index - b.index || b.amount - a.amount);
  return scored[0]!.amount;
}

export function extractMonetaryAmountFromEmail(ev: {
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): number | null {
  const text = [ev.subject, ev.summary, ev.bodyText, ev.bodySnippet].filter(Boolean).join('\n');
  return extractMonetaryAmountFromText(text);
}

export function formatUsdAmount(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Newsletter / notification boilerplate — not payment receipts. */
const NEWSLETTER_RECEIVED_BOILERPLATE =
  /\byou\s+received\s+this\s+(?:email|message|notification)\s+because\b/i;

/** Payment due / failed / Capital — alerts, not tax receipts. */
const FAILED_OR_DUE_PAYMENT =
  /\b(?:failed\s+payment|payment\s+(?:failed|declined)|outstanding\s+balance|upcoming\s+(?:minimum\s+)?payment|minimum\s+payment(?:\s+requirement)?|past\s+due|amount\s+due|currently\s+due|balance\s+(?:currently\s+)?due|capital\s+(?:loan|minimum|repayment)|loan\s+repayment|we\s+will\s+debit)\b/i;

/**
 * Expense / tax-receipt language — money you spent (not money someone paid you).
 * "Payment of $… from …" is income and must not match here.
 */
const RECEIPT_HINT =
  /\b(?:receipt|payment\s+confirm(?:ation|ed)?|payment\s+receipt|amount\s+paid|you\s+paid|billing\s+statement|your\s+receipt\s+from)\b/i;

/** Strong expense wording that overrides newsletter boilerplate in the same message. */
const STRONG_RECEIPT_HINT =
  /\b(?:receipt|payment\s+confirm(?:ation|ed)?|payment\s+receipt|amount\s+paid|you\s+paid|your\s+receipt\s+from)\b/i;

/** Incoming money — "Payment of $100 from Joel…", deposited funds, etc. Not an expense receipt. */
const INCOMING_PAYMENT =
  /\b(?:payment\s+of\s+\$[\d,]+(?:\.\d{2})?\s+from\b|received\s+a\s+payment|you\s+just\s+received(?:\s+a\s+payment)?|payment\s+from\b|sent\s+you\s+\$|money\s+(?:was\s+)?deposited)\b/i;

const PAYMENT_PROCESSOR_FROM =
  /@(?:[\w.-]+\.)?(?:stripe|paypal|squareup|square|cash\.app)\.com\b/i;

function paymentEmailText(ev: {
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): string {
  return [ev.subject, ev.summary, ev.bodyText, ev.bodySnippet].filter(Boolean).join('\n');
}

/** True when language is about money owed / failed — never auto-file as receipt. */
export function looksLikeFailedOrDuePayment(ev: {
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): boolean {
  return FAILED_OR_DUE_PAYMENT.test(paymentEmailText(ev));
}

/**
 * Money received from someone (income) — e.g. "Payment of $100.00 from Joel…".
 * Not a tax/expense receipt (no due/invoice/outstanding required to refuse expense filing).
 */
export function looksLikeIncomingPayment(ev: {
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): boolean {
  const text = paymentEmailText(ev);
  if (!text.trim()) return false;
  if (FAILED_OR_DUE_PAYMENT.test(text)) return false;
  return INCOMING_PAYMENT.test(text);
}

/**
 * Incoming payment notifications (Stripe/PayPal/etc. payouts / "payment from").
 * Used to block auto-project creation — not to file tax receipts.
 */
export function looksLikePaymentNotification(ev: {
  from?: string;
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): boolean {
  if (looksLikeIncomingPayment(ev)) return true;
  const text = paymentEmailText(ev);
  if (!text.trim()) return false;
  if (FAILED_OR_DUE_PAYMENT.test(text)) return false;
  // Bare "Payment of $…" without "from" is still usually a payout notice, not "you paid".
  if (/\bpayment\s+of\s+\$/i.test(text)) return true;
  if (PAYMENT_PROCESSOR_FROM.test(ev.from ?? '')) {
    return INCOMING_PAYMENT.test(text) || /\b(?:payout|transfer\s+sent|deposit)\b/i.test(text);
  }
  return false;
}

export type AutoFileReceiptAuditStep = {
  step: string;
  decision: string;
  detail?: string;
};

export type AutoFileReceiptResult = {
  amount: number;
  routeNote: string;
  audit: AutoFileReceiptAuditStep[];
};

function receiptAuditStep(
  step: string,
  decision: string,
  detail?: string,
): AutoFileReceiptAuditStep {
  return detail ? { step, decision, detail } : { step, decision };
}

/** Auto-file as tax/expense receipt when text has a dollar amount and expense-side keywords. */
export function shouldAutoFileAsReceipt(ev: {
  from?: string;
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): AutoFileReceiptResult | null {
  const text = paymentEmailText(ev);
  if (FAILED_OR_DUE_PAYMENT.test(text)) return null;
  // "Payment of $… from …" / deposited funds = income, not a Crater expense receipt.
  if (looksLikeIncomingPayment(ev) || looksLikePaymentNotification(ev)) return null;
  const amount = extractMonetaryAmountFromText(text);
  if (amount == null) return null;
  const amountStep = receiptAuditStep(
    'amount',
    `Extracted ${formatUsdAmount(amount)}`,
    'Dollar amount detected in subject/summary/body',
  );
  const titleStep = receiptAuditStep(
    'title',
    `Dashboard label: Tax receipt — ${formatUsdAmount(amount)}`,
    'Expense-side receipts (you paid / your receipt) use the Tax receipt banner for Crater logging',
  );
  if (NEWSLETTER_RECEIVED_BOILERPLATE.test(text) && !STRONG_RECEIPT_HINT.test(text)) {
    return null;
  }
  if (RECEIPT_HINT.test(text)) {
    return {
      amount,
      routeNote: `Tax receipt — ${formatUsdAmount(amount)}`,
      audit: [
        amountStep,
        receiptAuditStep(
          'payment_language',
          'Expense receipt language with amount',
          'Matched you paid / amount paid / your receipt / payment confirmation — not “payment from” income',
        ),
        receiptAuditStep(
          'auto_file',
          'Auto-filed as receipt',
          'shouldAutoFileAsReceipt → category=receipt',
        ),
        titleStep,
      ],
    };
  }
  return null;
}

export type ReceiptCandidate = {
  amount: number;
  routeNote: string;
  reason: string;
  score: number;
};

function isOperationalAlertRecord(ev: { category?: string; status?: string }): boolean {
  const category = String(ev.category || '').toLowerCase();
  if (category === 'alert') return true;
  const status = String(ev.status || '').toUpperCase();
  return (
    status.startsWith('RAILWAY') ||
    status === 'DOWN' ||
    status === 'NEEDS_CHECK' ||
    status === 'ANTHROPIC_BILLING'
  );
}

/** Score an inbox row for manual receipt recovery (Review/All messages not already filed). */
export function suggestReceiptCandidate(ev: {
  from?: string;
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
  category?: string;
  status?: string;
  routeNote?: string;
}): ReceiptCandidate | null {
  const category = String(ev.category || '').toLowerCase();
  if (category === 'receipt' || category === 'junk') return null;

  const auto = shouldAutoFileAsReceipt(ev);
  if (auto) {
    return {
      amount: auto.amount,
      routeNote: auto.routeNote,
      reason: 'Payment/receipt language with dollar amount',
      score: 90,
    };
  }

  if (isOperationalAlertRecord(ev) && !PAYMENT_PROCESSOR_FROM.test(ev.from ?? '')) {
    return null;
  }

  const amount = extractMonetaryAmountFromEmail(ev);
  if (amount == null) return null;

  const text = [ev.subject, ev.summary, ev.bodyText, ev.bodySnippet].filter(Boolean).join('\n');
  const subject = String(ev.subject || '');

  if (looksLikeIncomingPayment(ev) || looksLikePaymentNotification(ev)) {
    return null;
  }

  if (PAYMENT_PROCESSOR_FROM.test(ev.from ?? '') && STRONG_RECEIPT_HINT.test(text)) {
    return {
      amount,
      routeNote: `Tax receipt — ${formatUsdAmount(amount)}`,
      reason: 'Payment processor sender with expense receipt language',
      score: 85,
    };
  }

  if (/\b(receipt|payment confirmation|payment receipt|amount paid|you paid)\b/i.test(subject)) {
    return {
      amount,
      routeNote: `Tax receipt — ${formatUsdAmount(amount)}`,
      reason: 'Expense receipt language in subject',
      score: 80,
    };
  }

  if (STRONG_RECEIPT_HINT.test(text) && !NEWSLETTER_RECEIVED_BOILERPLATE.test(text)) {
    return {
      amount,
      routeNote: `Tax receipt — ${formatUsdAmount(amount)}`,
      reason: 'Strong expense receipt wording in message',
      score: 75,
    };
  }

  return null;
}
