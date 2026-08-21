/**
 * Structured classification audit trail for inbound email triage.
 * Persisted on inbox rows and surfaced on dashboard receipt notifications.
 */

import {
  extractMonetaryAmountFromEmail,
  formatUsdAmount,
  looksLikeFailedOrDuePayment,
  looksLikeIncomingPayment,
  looksLikePaymentNotification,
  looksLikeShipmentNotice,
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
  /** Persisted email_rules.id when this step is a keyword / catalog rule. */
  ruleId?: string;
  ruleTitle?: string;
};

export type ClassificationRuleLink = {
  ruleId?: string | null;
  ruleTitle?: string | null;
};

export function classificationAuditStep(
  step: string,
  decision: string,
  detail?: string,
  link?: ClassificationRuleLink,
): ClassificationAuditStep {
  const out: ClassificationAuditStep = { step, decision };
  if (detail?.trim()) out.detail = detail.trim();
  const ruleId = String(link?.ruleId || '').trim();
  if (ruleId) out.ruleId = ruleId;
  const ruleTitle = String(link?.ruleTitle || '').trim();
  if (ruleTitle) out.ruleTitle = ruleTitle;
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
    steps.push(
      classificationAuditStep(step, decision, detail || undefined, {
        ruleId: rec.ruleId != null ? String(rec.ruleId) : undefined,
        ruleTitle: rec.ruleTitle != null ? String(rec.ruleTitle) : undefined,
      }),
    );
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

function ruleLinkFrom(rule: EmailRule | (EmailRule & { id?: string; title?: string }) | null | undefined): ClassificationRuleLink | undefined {
  if (!rule || typeof rule !== 'object') return undefined;
  const id = 'id' in rule ? String(rule.id || '').trim() : '';
  const title = 'title' in rule ? String(rule.title || '').trim() : '';
  if (!id && !title) return undefined;
  return { ruleId: id || undefined, ruleTitle: title || undefined };
}

export function auditForMatchedRule(
  rule: EmailRule | (EmailRule & { id?: string; title?: string }) | null | undefined,
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
  const except = Array.isArray(rule.exceptPhrases) ? rule.exceptPhrases.filter(Boolean) : [];
  const detail = [
    rule.description?.trim(),
    phraseBits.length ? `Matched ${phraseBits.join(', ')}` : null,
    except.length
      ? `Except cleared (${except.slice(0, 3).map((p) => `"${p}"`).join(', ')})`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return classificationAuditStep(
    'rules',
    `Matched ${rule.status} rule`,
    detail || undefined,
    ruleLinkFrom(rule),
  );
}

export type ClassificationRuleRef = {
  id?: string;
  status?: string;
  phrases?: string[];
  description?: string;
  title?: string;
};

export function findShipmentArchiveRule<T extends ClassificationRuleRef>(rules: T[]): T | null {
  return (
    rules.find((r) => {
      const phrases = Array.isArray(r.phrases) ? r.phrases : [];
      return (
        String(r.status || '').toUpperCase() === 'AUTO_ARCHIVED' &&
        phrases.some((p) => /shipment\s*[-]?track/i.test(String(p)))
      );
    }) ?? null
  );
}

function findRuleByStatusHint<T extends ClassificationRuleRef>(
  rules: T[],
  status: string,
  haystack: string,
): T | null {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  if (!key) return null;
  const candidates = rules.filter((r) => String(r.status || '').toUpperCase() === key);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const hay = haystack.toLowerCase();
  return (
    candidates.find((r) => {
      const bits = [r.description, r.title].filter(Boolean).join(' ').toLowerCase();
      return Boolean(bits && hay && (hay.includes(bits.slice(0, 20)) || bits.includes(hay.slice(0, 20))));
    }) ?? candidates[0]
  );
}

/** Attach rule ids to older audit rows that only stored the status/description. */
export function attachClassificationRuleLinks(
  steps: ClassificationAuditStep[],
  rules: ClassificationRuleRef[],
  extras?: { routeNote?: string },
): ClassificationAuditStep[] {
  const shipment = findShipmentArchiveRule(rules);
  const hay = [...steps.map((s) => `${s.decision} ${s.detail || ''}`), extras?.routeNote || ''].join(
    '\n',
  );
  const shipmentRelated = /shipment|shipping notice|not a tax receipt|auto-archiv/i.test(hay);

  return steps.map((step) => {
    if (step.ruleId) return step;
    const matched = /^Matched (\S+) rule/i.exec(step.decision);
    if (matched) {
      const rule = findRuleByStatusHint(rules, matched[1], step.detail || '');
      if (rule?.id) return { ...step, ruleId: rule.id, ruleTitle: rule.title };
    }
    const silent = /^Silent rule short-circuit:\s*(\S+)/i.exec(step.decision);
    if (silent) {
      const rule = findRuleByStatusHint(rules, silent[1], step.detail || '');
      if (rule?.id) return { ...step, ruleId: rule.id, ruleTitle: rule.title };
    }
    const stepHay = `${step.step} ${step.decision} ${step.detail || ''}`;
    if (
      shipmentRelated &&
      shipment?.id &&
      /^(ai|rules|correction|route_note|agent|auto_file|payment_language)\b/i.test(step.step) &&
      /shipment|shipping|auto-archiv|junk per rules|not a tax receipt/i.test(
        `${stepHay} ${extras?.routeNote || ''}`,
      )
    ) {
      return { ...step, ruleId: shipment.id, ruleTitle: shipment.title };
    }
    return step;
  });
}

export function primaryClassificationRule(
  steps: ClassificationAuditStep[],
): { ruleId: string; ruleTitle?: string } | null {
  const preferred = steps.find(
    (s) => s.ruleId && /^(Matched |Rule$|Silent rule)/i.test(s.decision),
  );
  if (preferred?.ruleId) return { ruleId: preferred.ruleId, ruleTitle: preferred.ruleTitle };
  const any = steps.find((s) => s.ruleId);
  return any?.ruleId ? { ruleId: any.ruleId, ruleTitle: any.ruleTitle } : null;
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
          'Blocks auto-file as expense receipt',
        ),
      );
    } else if (looksLikeShipmentNotice(emailLike)) {
      steps.push(
        classificationAuditStep(
          'payment_language',
          'Shipment tracking — not a tax receipt',
          'Shipping / package-tracked notices auto-archive; they are not expense receipts',
        ),
      );
    } else if (looksLikeIncomingPayment(emailLike) || looksLikePaymentNotification(emailLike)) {
      const subject = (record.subject || '').trim();
      steps.push(
        classificationAuditStep(
          'payment_language',
          'Incoming payment (income) — not a tax receipt',
          `"from" marks money received, not an expense${subject ? ` — subject: ${subject.slice(0, 120)}` : ''}. No due/invoice/outstanding language required to refuse expense filing.`,
        ),
      );
    } else {
      const auto = shouldAutoFileAsReceipt(emailLike);
      if (auto) {
        steps.push(
          classificationAuditStep(
            'payment_language',
            'Expense receipt language with amount',
            'RECEIPT_HINT matched (you paid, amount paid, your receipt, payment confirmation)',
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
        'Expense-side receipts use the Tax receipt banner for Crater logging — not “Payment of $… from …” income',
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
        'Expense-side receipts use the Tax receipt banner for Crater logging',
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
