/**
 * When no keyword rule matches, the agent drafts a triage rule (same fields
 * as Admin → Rules) for the owner to accept — not an admin-configured step.
 */

import { serverEnv } from './serverEnv';
import { normalizeEmailBody } from './emailBody';
import {
  coalesceRuleNotifyFields,
  normalizeNotifyActions,
  type InboundEmail,
  type MatchMode,
  type RuleField,
  type RuleNotifyAction,
} from './emailRules';
import type { RuleInput } from './emailRuleStore';

export type ProposedEmailRule = RuleInput & {
  reason?: string;
};

const ALLOWED_FIELDS = new Set<RuleField>(['subject', 'body', 'from']);

function parseFields(raw: unknown): RuleField[] {
  if (!Array.isArray(raw)) return ['subject', 'body'];
  const out = raw
    .map((f) => String(f).trim().toLowerCase())
    .filter((f): f is RuleField => ALLOWED_FIELDS.has(f as RuleField));
  return out.length ? out : ['subject', 'body'];
}

function parseProposedRule(raw: unknown): ProposedEmailRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? '').trim();
  const status = String(o.status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!title || !status) return null;
  const phrases = Array.isArray(o.phrases)
    ? o.phrases.map((p) => String(p).trim()).filter(Boolean)
    : [];
  const exceptPhrases = Array.isArray(o.exceptPhrases)
    ? o.exceptPhrases.map((p) => String(p).trim()).filter(Boolean)
    : Array.isArray(o.except_phrases)
      ? o.except_phrases.map((p) => String(p).trim()).filter(Boolean)
      : [];
  const notifyFields = coalesceRuleNotifyFields({
    notify: o.notify === true,
    notifyPush: o.notifyPush ?? o.notify_push,
    notifyDashboard: o.notifyDashboard ?? o.notify_dashboard,
    notifyActions: o.notifyActions ?? o.notify_actions,
  });
  return {
    title: title.slice(0, 120),
    status: status.slice(0, 64),
    description: o.description != null ? String(o.description).trim().slice(0, 400) : undefined,
    phrases: phrases.slice(0, 12),
    exceptPhrases: exceptPhrases.slice(0, 8),
    matchMode: (o.matchMode === 'all' ? 'all' : 'any') as MatchMode,
    fields: parseFields(o.fields),
    notify: notifyFields.notify,
    notifyPush: notifyFields.notifyPush,
    notifyDashboard: notifyFields.notifyDashboard,
    notifyActions: (notifyFields.notifyActions.length
      ? notifyFields.notifyActions
      : normalizeNotifyActions(['view', 'archive'])) as RuleNotifyAction[],
    enabled: o.enabled !== false,
    expiresAt: null,
    forwardTo: null,
    reason: o.reason != null ? String(o.reason).trim().slice(0, 400) : undefined,
  };
}

/**
 * Draft a keyword rule the owner can accept for similar future mail.
 * Returns null when AI is disabled or the call fails.
 */
export async function proposeEmailFilterRule(
  email: InboundEmail,
): Promise<ProposedEmailRule | null> {
  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) return null;
  if (serverEnv('EMAIL_AI_ENABLED')?.trim() === '0') return null;

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';
  const body = normalizeEmailBody(email.text, email.html).slice(0, 4000);

  const system = `You design ONE email triage keyword rule for a small web agency inbox.
The rule must be content-based (subject/body phrases), not a brittle full sender address unless the From domain is uniquely identifying.
Respond with ONLY valid JSON (no markdown fences):
{
  "title": "short human title",
  "status": "UPPER_SNAKE status tag e.g. DELETE, RECEIPT, NEEDS_CHECK, RAILWAY_ALERT, CLIENT_REPLY",
  "description": "one line why this rule exists",
  "phrases": ["2-6 distinctive case-insensitive substrings"],
  "exceptPhrases": ["optional NOT phrases that veto a match"],
  "matchMode": "any" | "all",
  "fields": ["subject","body"] or include "from" when sender-specific,
  "notify": true/false,
  "notifyPush": true/false,
  "notifyDashboard": true/false,
  "notifyActions": ["view","archive"] or otp/auth/expense buttons when relevant,
  "enabled": true,
  "reason": "one sentence: best handling for THIS email and similar ones"
}

Prefer silent DELETE/JUNK for marketing. Prefer notify for ops/security/client work.
Phrases must be specific enough to avoid false positives.`;

  const user = `From: ${email.from}
Subject: ${email.subject || '(none)'}
Body:
${body || '(empty)'}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      console.warn('[email] propose rule HTTP', res.status);
      return null;
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
    };
    const text = (data.content || [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text || '')
      .join('\n')
      .trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return parseProposedRule(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.warn('[email] propose rule failed', e);
    return null;
  }
}
