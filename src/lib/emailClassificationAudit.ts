/**
 * Structured classification audit trail for inbound email triage.
 * Persisted on inbox rows and surfaced on dashboard receipt notifications.
 */

import {
  extractMonetaryAmountFromEmail,
  formatUsdAmount,
  looksLikeFailedOrDuePayment,
  looksLikePaymentNotification,
  shouldAutoFileAsReceipt,
} from './emailMoney';
import { DEFAULT_RULES, type EmailRule, type InboundEmail } from './emailRules';
import type { EmailInboxRecord } from './emailInboxStore';

export type ClassificationAuditStep = {
  /** Stable stage id, e.g. rules | amount | payment_language | auto_file | title */
  step: string;
  /** Short human decision, e.g. "Matched RECEIPT rule" */
  decision: string;
  /** Optional why / evidence */
  detail?: string;
};

export function classificationAuditStep(
  step: string,
  decision: string,
  detail?: string,
): ClassificationAuditStep {
  const out: ClassificationAuditStep = { step, decision };
  if (detail?.trim()) out.detail = detail.trim();
  return out;
}

export function parseClassificationAudit(raw: unknown): ClassificationAuditStep[] {
  if (!raw) return [];
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const steps: ClassificationAuditStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const step = String(rec.step ?? '').trim();
    const decision = String(rec.decision ?? '').trim();
    if (!step || !decision) continue;
    const detail = rec.detail != null ? String(rec.detail).trim() : '';
    steps.push(classificationAuditStep(step, decision, detail || undefined));
  }
  return steps;
}

export function serializeClassificationAudit(steps: ClassificationAuditStep[]): ClassificationAuditStep[] {
  return parseClassificationAudit(steps);
}

/** Which rule phrases hit the email (for audit detail). */
export function matchedRulePhrases(rule: EmailRule, email: InboundEmail): string[] {
  if (!rule.phrases.length) return [];
  const fieldMap: Record<string, string> = {
    subject: email.subject ?? '',
    body: email.text ?? '',
    from: email.from ?? '',
  };
  const haystack = rule.fields
    .map((f) => String(fieldMap[f] ?? '').toLowerCase())
    .join('\n');
  return rule.phrases.filter((p) => haystack.includes(p.toLowerCase()));
}

function fieldHitLabel(phrase: string, email: Pick<InboundEmail, 'subject' | 'text' | 'from'>): string {
  const p = phrase.toLowerCase();
  if ((email.subject ?? '').toLowerCase().includes(p)) return `subject`;
  if ((email.from ?? '').toLowerCase().includes(p)) return `from`;
  if ((email.text ?? '').toLowerCase().includes(p)) return `body`;
  return 'message';
}

export function auditForMatchedRule(
  rule: EmailRule | null | undefined,
  status: string,
  email: InboundEmail,
): ClassificationAuditStep {
  if (!rule) {
    return classificationAuditStep(
      'rules',
      status === 'UNMATCHED' ? 'No keyword rule matched' : `Status ${status} (no rule object)`,
      status === 'UNMATCHED' ? 'Fell through to unmatched / later heuristics' : undefined,
    );
  }
  const phrases = matchedRulePhrases(rule, email);
  const phraseBits = phrases.slice(0, 3).map((p) => `"${p}" in ${fieldHitLabel(p, email)}`);
  const detail = [
    rule.description?.trim(),
    phraseBits.length ? `Matched ${phraseBits.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return classificationAuditStep('rules', `Matched ${rule.status} rule`, detail || undefined);
}

/**
 * Rebuild a receipt-classification audit when none was persisted (older rows),
 * or enrich a thin trail with money/title steps.
 */
export function explainReceiptClassification(
  record: Pick<
    EmailInboxRecord,
    | 'from'
    | 'subject'
    | 'summary'
    | 'bodySnippet'
    | 'bodyText'
    | 'category'
    | 'status'
    | 'action'
    | 'routeNote'
    | 'classificationAudit'
  >,
): ClassificationAuditStep[] {
  const persisted = parseClassificationAudit(record.classificationAudit);
  if (persisted.length >= 2) return persisted;

  const steps: ClassificationAuditStep[] = [...persisted];
  const hasStep = (id: string) => steps.some((s) => s.step === id);

  const emailLike = {
    from: record.from,
    subject: record.subject,
    summary: record.summary,
    bodySnippet: record.bodySnippet,
    bodyText: record.bodyText,
  };

  if (!hasStep('rules')) {
    const status = String(record.status || '').toUpperCase();
    if (status === 'RECEIPT') {
      const receiptRule = DEFAULT_RULES.find((r) => r.status === 'RECEIPT');
      if (receiptRule) {
        const phrases = matchedRulePhrases(receiptRule, {
          from: record.from,
          subject: record.subject,
          text: [record.bodyText, record.bodySnippet, record.summary].filter(Boolean).join('\n'),
        });
        if (phrases.length) {
          steps.push(
            classificationAuditStep(
              'rules',
              'Matched RECEIPT rule',
              `Matched ${phrases
                .slice(0, 3)
                .map(
                  (p) =>
                    `"${p}" in ${fieldHitLabel(p, {
                      subject: record.subject,
                      text: record.bodyText || record.bodySnippet,
                      from: record.from,
                    })}`,
                )
                .join(', ')}`,
            ),
          );
        } else {
          steps.push(
            classificationAuditStep(
              'rules',
              'Status RECEIPT',
              'Inbox status is RECEIPT (rule match and/or auto-file)',
            ),
          );
        }
      }
    } else if (String(record.routeNote || '').includes('AI ') || /AI\s+\w+/i.test(record.routeNote || '')) {
      steps.push(
        classificationAuditStep('ai', 'AI classified as receipt', record.routeNote || undefined),
      );
    } else {
      steps.push(
        classificationAuditStep(
          'rules',
          `Prior status ${status || 'unknown'}`,
          'Receipt filing came from auto-file heuristics or a manual/agent mark',
        ),
      );
    }
  }

  const amount = extractMonetaryAmountFromEmail(emailLike);
  if (!hasStep('amount')) {
    if (amount != null) {
      steps.push(
        classificationAuditStep(
          'amount',
          `Extracted ${formatUsdAmount(amount)}`,
          'Dollar amount detected in subject/summary/body',
        ),
      );
    } else {
      steps.push(
        classificationAuditStep('amount', 'No dollar amount detected', 'Title falls back to generic tax receipt copy'),
      );
    }
  }

  if (!hasStep('payment_language')) {
    if (looksLikeFailedOrDuePayment(emailLike)) {
      steps.push(
        classificationAuditStep(
          'payment_language',
          'Looks like failed/due payment',
          'Would normally block auto-file as receipt',
        ),
      );
    } else if (looksLikePaymentNotification(emailLike)) {
      const subject = (record.subject || '').trim();
      const paymentOf = /\bpayment\s+of\s+\$/i.test(
        [record.subject, record.summary, record.bodyText, record.bodySnippet].join('\n'),
      );
      steps.push(
        classificationAuditStep(
          'payment_language',
          'Completed payment language',
          paymentOf
            ? `"Payment of $…" is treated as a completed payment confirmation (not an unpaid bill)${subject ? ` — subject: ${subject.slice(0, 120)}` : ''}`
            : 'Payment-received / processor wording matched',
        ),
      );
    } else {
      const auto = shouldAutoFileAsReceipt(emailLike);
      if (auto) {
        steps.push(
          classificationAuditStep(
            'payment_language',
            'Receipt/payment keywords with amount',
            'RECEIPT_HINT matched (receipt, invoice, you paid, etc.)',
          ),
        );
      }
    }
  }

  if (!hasStep('auto_file') && record.category === 'receipt') {
    steps.push(
      classificationAuditStep(
        'auto_file',
        'Filed as receipt',
        `category=receipt · action=${record.action || 'receipt'} · status=${record.status || 'RECEIPT'}`,
      ),
    );
  }

  if (!hasStep('title') && record.category === 'receipt') {
    const title =
      amount != null ? `Tax receipt — ${formatUsdAmount(amount)}` : 'Tax receipt ready to log';
    steps.push(
      classificationAuditStep(
        'title',
        `Dashboard label: ${title}`,
        'All pending receipt emails use the “Tax receipt” banner title so they can be logged as Crater expenses — including completed “Payment of $…” confirmations',
      ),
    );
  }

  if (record.routeNote?.trim() && !steps.some((s) => s.step === 'route_note')) {
    steps.push(classificationAuditStep('route_note', 'Route note', record.routeNote.trim()));
  }

  return steps;
}

/** Audit steps when an owner/agent manually marks mail as a receipt. */
export function auditForManualReceiptMark(opts: {
  source: 'manual' | 'agent' | 'suggest_receipts';
  amount: number | null;
  reason?: string;
}): ClassificationAuditStep[] {
  const sourceLabel =
    opts.source === 'agent'
      ? 'Agent marked as receipt'
      : opts.source === 'suggest_receipts'
        ? 'Filed via Find missing receipts'
        : 'Manually marked as receipt';
  const steps: ClassificationAuditStep[] = [
    classificationAuditStep('source', sourceLabel, opts.reason),
  ];
  if (opts.amount != null) {
    steps.push(
      classificationAuditStep('amount', `Extracted ${formatUsdAmount(opts.amount)}`),
      classificationAuditStep(
        'title',
        `Dashboard label: Tax receipt — ${formatUsdAmount(opts.amount)}`,
        'Pending receipt emails use the “Tax receipt” banner for expense logging',
      ),
    );
  } else {
    steps.push(
      classificationAuditStep('amount', 'No dollar amount detected'),
      classificationAuditStep('title', 'Dashboard label: Tax receipt ready to log'),
    );
  }
  steps.push(
    classificationAuditStep('auto_file', 'Filed as receipt', 'category=receipt · status=RECEIPT'),
  );
  return steps;
}
