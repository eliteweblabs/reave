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

/** Payment/receipt language — used with a detected dollar amount to auto-file tax receipts. */
const RECEIPT_HINT =
  /\b(?:receipt|invoice|invoiced|payment\s+confirm(?:ation|ed)?|payment\s+of|received\s+a\s+payment|you\s+(?:just\s+)?received(?:\s+a\s+payment)?|order\s+confirm(?:ation)?|paid|purchase|purchased|transaction|charged|billing\s+statement|amount\s+paid|you\s+paid)\b/i;

const PAYMENT_PROCESSOR_FROM =
  /@(?:[\w.-]+\.)?(?:stripe|paypal|squareup|square|cash\.app)\.com\b/i;

/** Stripe/PayPal/Square payment notifications — not client work requests. */
export function looksLikePaymentNotification(ev: {
  from?: string;
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): boolean {
  if (PAYMENT_PROCESSOR_FROM.test(ev.from ?? '')) return true;
  const text = [ev.subject, ev.summary, ev.bodyText, ev.bodySnippet].filter(Boolean).join('\n');
  if (!text.trim()) return false;
  // Stripe dashboard subject: "Payment of $200.00 from Joel Williams for Eliteweblabs"
  if (/\bpayment\s+of\s+\$/i.test(text)) return true;
  const amount = extractMonetaryAmountFromText(text);
  if (amount == null) return false;
  return /\b(?:received\s+a\s+payment|you\s+just\s+received|payment\s+from|sent\s+you\s+\$|money\s+(?:was\s+)?deposited)\b/i.test(
    text,
  );
}

/** Auto-file as receipt when text has both a dollar amount and receipt/payment keywords. */
export function shouldAutoFileAsReceipt(ev: {
  from?: string;
  subject?: string;
  summary?: string;
  bodySnippet?: string;
  bodyText?: string;
}): { amount: number; routeNote: string } | null {
  const text = [ev.subject, ev.summary, ev.bodyText, ev.bodySnippet].filter(Boolean).join('\n');
  const amount = extractMonetaryAmountFromText(text);
  if (amount == null) return null;
  if (looksLikePaymentNotification(ev) || RECEIPT_HINT.test(text)) {
    return { amount, routeNote: `Tax receipt — ${formatUsdAmount(amount)}` };
  }
  return null;
}
