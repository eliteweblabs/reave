/**
 * Test / apply an email rule against existing inbox rows.
 * Test = dry match list. Apply = run the rule's filing action on selected ids.
 */

import {
  emailMatchesRule,
  type EmailRule,
  type InboundEmail,
  type MatchMode,
  type RuleField,
} from './emailRules';
import {
  archiveEmailInboxPatch,
  isHiddenInboxCategory,
  storeGetEmailInbox,
  storeListEmailInbox,
  storeUpdateEmailInbox,
  type EmailInboxPatch,
  type EmailInboxRecord,
} from './emailInboxStore';
import { incrementEmailRuleHit } from './emailRuleStore';
import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import { auditForManualReceiptMark } from './emailClassificationAudit';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from './emailMoney';

const MAX_SCAN = 500;
const MAX_APPLY = 100;

export type RuleApplyDraft = {
  phrases: string[];
  phraseFields?: RuleField[];
  exceptPhrases?: string[];
  fields: RuleField[];
  matchMode?: MatchMode;
  status?: string;
};

export type RuleTestMatch = {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  summary: string;
  category: string;
  status: string;
};

function inboxToInbound(row: EmailInboxRecord): InboundEmail {
  return {
    from: row.from || '',
    subject: row.subject || '',
    text: row.bodyText || row.bodySnippet || row.summary || '',
  };
}

function normalizeDraft(raw: RuleApplyDraft): EmailRule | null {
  const phrases = (Array.isArray(raw.phrases) ? raw.phrases : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!phrases.length) return null;
  const fields = (Array.isArray(raw.fields) ? raw.fields : [])
    .map((f) => String(f || '').trim().toLowerCase())
    .filter((f): f is RuleField => f === 'from' || f === 'subject' || f === 'body');
  const phraseFieldsRaw = raw.phraseFields;
  const phraseFields =
    Array.isArray(phraseFieldsRaw) && phraseFieldsRaw.length === phrases.length && phrases.length > 1
      ? phraseFieldsRaw
          .map((f) => String(f || '').trim().toLowerCase())
          .filter((f): f is RuleField => f === 'from' || f === 'subject' || f === 'body')
      : undefined;
  const paired =
    phraseFields && phraseFields.length === phrases.length && new Set(phraseFields).size >= 2
      ? phraseFields
      : undefined;
  return {
    status: String(raw.status || 'CUSTOM').trim() || 'CUSTOM',
    phrases,
    phraseFields: paired,
    exceptPhrases: (Array.isArray(raw.exceptPhrases) ? raw.exceptPhrases : [])
      .map((p) => String(p || '').trim())
      .filter(Boolean),
    matchMode: raw.matchMode === 'all' ? 'all' : 'any',
    fields: fields.length ? fields : ['subject', 'body'],
    notify: false,
    enabled: true,
  };
}

function toMatchRow(row: EmailInboxRecord): RuleTestMatch {
  return {
    id: row.id,
    receivedAt: row.receivedAt,
    from: row.from,
    subject: row.subject,
    summary: row.summary || row.bodySnippet || row.subject || '',
    category: row.category,
    status: row.status,
  };
}

/** Scan recent visible inbox for rows that match the draft rule. */
export async function testEmailRuleAgainstInbox(draft: RuleApplyDraft): Promise<{
  ok: true;
  scanned: number;
  matches: RuleTestMatch[];
} | { ok: false; error: string }> {
  const rule = normalizeDraft(draft);
  if (!rule) return { ok: false, error: 'Add at least one Target phrase to test.' };

  const rows = await storeListEmailInbox(MAX_SCAN, { hideJunk: true });
  const matches: RuleTestMatch[] = [];
  for (const row of rows) {
    if (emailMatchesRule(rule, inboxToInbound(row))) {
      matches.push(toMatchRow(row));
    }
  }
  return { ok: true, scanned: rows.length, matches };
}

function patchForRuleStatus(
  status: string,
  existing: EmailInboxRecord,
): { patch: EmailInboxPatch | null; skipReason?: string } {
  const s = status.toUpperCase();
  if (s === 'DELETE' || s === 'JUNK') {
    if (existing.category === 'auto_deleted') {
      return { patch: null, skipReason: 'already deleted' };
    }
    if (existing.category === 'receipt') {
      return { patch: null, skipReason: 'receipt — left alone' };
    }
    return {
      patch: {
        category: 'auto_deleted',
        action: 'deleted',
        status: 'DELETE',
      },
    };
  }
  if (s === 'AUTO_ARCHIVED') {
    if (String(existing.status || '').toUpperCase() === 'AUTO_ARCHIVED' && existing.action === 'filed') {
      return { patch: null, skipReason: 'already archived' };
    }
    return {
      patch: {
        ...archiveEmailInboxPatch(existing.category),
        status: 'AUTO_ARCHIVED',
        category: existing.category === 'receipt' ? existing.category : 'internal',
        action: 'filed',
      },
    };
  }
  if (s === 'RECEIPT') {
    if (existing.category === 'receipt') {
      return { patch: null, skipReason: 'already a receipt' };
    }
    const amount = extractMonetaryAmountFromEmail(existing);
    const routeNote =
      amount != null ? `Tax receipt — ${formatUsdAmount(amount)}` : 'Tax receipt';
    return {
      patch: {
        category: 'receipt',
        action: 'receipt',
        status: 'RECEIPT',
        routeNote,
        classificationAudit: auditForManualReceiptMark({ source: 'agent', amount }),
      },
    };
  }
  return { patch: null, skipReason: 'Keep leaves mail in the inbox — nothing to apply' };
}

export async function applyEmailRuleToInbox(opts: {
  ruleId?: string | null;
  status: string;
  ids: string[];
}): Promise<{
  ok: true;
  applied: number;
  skipped: Array<{ id: string; reason: string }>;
  matches: RuleTestMatch[];
} | { ok: false; error: string }> {
  const status = String(opts.status || '').trim();
  if (!status) return { ok: false, error: 'status is required' };

  const ids = [...new Set(opts.ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'No emails to apply.' };
  if (ids.length > MAX_APPLY) {
    return { ok: false, error: `Too many emails (max ${MAX_APPLY}).` };
  }

  const appliedRows: RuleTestMatch[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let applied = 0;

  for (const id of ids) {
    const existing = await storeGetEmailInbox(id);
    if (!existing) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }
    if (isHiddenInboxCategory(existing.category) && status.toUpperCase() === 'DELETE') {
      skipped.push({ id, reason: 'already hidden' });
      continue;
    }
    const { patch, skipReason } = patchForRuleStatus(status, existing);
    if (!patch) {
      skipped.push({ id, reason: skipReason || 'skipped' });
      continue;
    }
    const updated = await storeUpdateEmailInbox(id, patch);
    if (!updated) {
      skipped.push({ id, reason: 'update failed' });
      continue;
    }
    applied += 1;
    appliedRows.push(toMatchRow(updated));
    if (
      patch.category === 'auto_deleted' ||
      patch.status === 'AUTO_ARCHIVED' ||
      patch.category === 'junk'
    ) {
      await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
    }
  }

  const ruleId = String(opts.ruleId || '').trim();
  if (ruleId && applied > 0) {
    for (let i = 0; i < applied; i++) {
      await incrementEmailRuleHit(ruleId).catch(() => undefined);
    }
  }

  return { ok: true, applied, skipped, matches: appliedRows };
}
