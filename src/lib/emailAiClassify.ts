/**
 * Agent-first inbound email classification with confidence.
 * Used for unknown senders and contacts marked clientKind=service.
 * Known contacts are never filed as junk from this path — catalog DELETE
 * skip + label remap in processInboundEmail.
 */

import { serverEnv } from './serverEnv';
import { normalizeEmailBody } from './emailBody';
import {
  formatAttachmentListForPrompt,
  normalizeEmailAttachments,
} from './emailAttachments';
import { MEETING_SKIP_CATEGORIES, parseProposedMeetingStart } from './emailMeetingParse';
import type { InboundEmail } from './emailRules';
import type { WorkJobSummary } from './workStore';

type MappedCategory =
  | 'junk'
  | 'client'
  | 'alert'
  | 'internal'
  | 'review'
  | 'receipt'
  | 'otp'
  | 'auth_link';

/** Labels the model may return (newsletter → junk). */
export type AiEmailLabel =
  | 'activation_link'
  | 'otp'
  | 'receipt'
  | 'failed_payment'
  | 'junk'
  | 'alert'
  | 'google_alert'
  | 'client'
  | 'project'
  | 'internal'
  | 'review';

export type AiClassifyResult = {
  label: AiEmailLabel;
  confidence: number;
  summary: string;
  job_slug: string | null;
  note_to_append: string | null;
  reason: string;
  proposed_meeting_start: string | null;
  scheduling_note: string | null;
  proposed_meeting_duration_minutes: number | null;
};

const AI_LABELS = new Set<string>([
  'activation_link',
  'otp',
  'receipt',
  'failed_payment',
  'junk',
  'newsletter',
  'alert',
  'google_alert',
  'client',
  'project',
  'internal',
  'review',
]);

/** Minimum confidence to trust the agent label (else fall back to rules). */
export function aiConfidenceThreshold(): number {
  const raw = serverEnv('EMAIL_AI_CONFIDENCE_MIN')?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0.5 && n <= 0.99) return n;
  }
  return 0.72;
}

export function shouldAgentFirstClassify(opts: {
  hasContact: boolean;
  clientKind: string | null;
}): boolean {
  if (!opts.hasContact) return true;
  return opts.clientKind === 'service';
}

export function mapAiLabelToOutcome(label: AiEmailLabel): {
  category: MappedCategory;
  action: string;
  status: string;
} {
  switch (label) {
    case 'otp':
      return { category: 'otp', action: 'verification_code', status: 'VERIFICATION_CODE' };
    case 'activation_link':
      return { category: 'auth_link', action: 'activation_link', status: 'AUTH_LINK' };
    case 'receipt':
      return { category: 'receipt', action: 'receipt', status: 'RECEIPT' };
    case 'failed_payment':
      return { category: 'alert', action: 'failed_payment', status: 'FAILED_PAYMENT' };
    case 'junk':
      return { category: 'junk', action: 'junk', status: 'DELETE' };
    case 'google_alert':
      return { category: 'alert', action: 'google_alert', status: 'GOOGLE_ALERT' };
    case 'alert':
      return { category: 'alert', action: 'alert', status: 'NEEDS_CHECK' };
    case 'project':
      return { category: 'client', action: 'review', status: 'UNMATCHED' };
    case 'client':
      return { category: 'client', action: 'review', status: 'UNMATCHED' };
    case 'internal':
      return { category: 'internal', action: 'classified', status: 'UNMATCHED' };
    case 'review':
    default:
      return { category: 'review', action: 'review', status: 'UNMATCHED' };
  }
}

function normalizeLabel(raw: unknown): AiEmailLabel {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_');
  if (v === 'newsletter' || v === 'newsletter_junk') return 'junk';
  if (v === 'client_project') return 'client';
  if (AI_LABELS.has(v) && v !== 'newsletter') return v as AiEmailLabel;
  return 'review';
}

function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function parseMeetingDurationMinutesField(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const minutes = Math.round(n);
  if (minutes < 5 || minutes > 480) return null;
  return minutes;
}

/**
 * Claude classify call — returns label + confidence.
 * Null when AI is disabled or the call fails.
 */
export async function runAiClassify(
  email: InboundEmail,
  jobs: WorkJobSummary[],
  contactName: string | null,
  contactKind: string | null,
  receivedAtIso?: string,
): Promise<AiClassifyResult | null> {
  const key = serverEnv('ANTHROPIC_API_KEY')?.trim();
  if (!key) return null;

  const model = serverEnv('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-4-6';
  const jobLines =
    jobs.length > 0
      ? jobs
          .slice(0, 12)
          .map((j) => `- ${j.slug}: ${j.title} (${j.status})`)
          .join('\n')
      : '(no open jobs for this sender)';

  const system = `You classify inbound email for a web design / dev business owner.
Respond with ONLY valid JSON (no markdown fences):
{
  "label": "activation_link" | "otp" | "receipt" | "failed_payment" | "junk" | "alert" | "google_alert" | "client" | "project" | "internal" | "review",
  "confidence": 0.0-1.0,
  "summary": "1-2 sentences the owner reads instead of the full email",
  "job_slug": "slug from the job list below, or null",
  "note_to_append": "project-relevant facts to append to the job file, or null",
  "reason": "short classification explanation",
  "proposed_meeting_start": "ISO 8601 datetime with offset when the email proposes a concrete meeting date AND time, otherwise null",
  "scheduling_note": "short human phrase for the proposed meeting time AND length when stated (e.g. Tuesday 2pm for 1 hour), or null when not scheduling",
  "proposed_meeting_duration_minutes": "integer minutes when the email states a meeting length (60 for an hour); null when unspecified"
}

Labels (pick exactly one):
- otp: one-time password / digit login code the owner must type
- activation_link: magic sign-in / account activation / one-click login LINK (not social "Open App" buttons, not follower notifications)
- receipt: expense you paid — "you paid", "amount paid", "your receipt from", payment confirmation for a charge you made (tax/expense receipt). NOT money someone paid you. NOT shipping / shipment tracking / "your order has shipped" / "Shipped:" notices.
- failed_payment: payment FAILED, past due, outstanding balance, upcoming minimum payment, Stripe Capital loan debit / "debit initiated", loan capital reminder — NOT a receipt
- Prefer internal or review (not receipt) for income notices like "Payment of $… from …", "you received a payment", "payment from" — those are money in, not expenses
- Prefer junk (not receipt) for shipment tracking, package shipped, and Amazon shipping-confirmation mail — those auto-archive; they are not tax receipts
- junk: newsletters, marketing, social notifications (TikTok/Facebook/Instagram followers, likes), bulk lists. NEVER use junk when Known contact is a name — known senders are not junk (use internal or review).
- google_alert: Google Alerts / news digests / keyword monitors — never a new client project
- alert: uptime, security, monitoring, deploy failures, unusual sign-in warnings (not OTP/activation)
- client: client project updates, requests, files, approvals from a known client
- project: clear new work request that may deserve a new project (website build/redesign/quote) — NOT alerts or news
- internal: personal/admin not tied to a client job
- review: ambiguous — needs human decision

Confidence rules:
- Use high confidence (≥0.85) only when the label is obvious from subject/body.
- Social notifications, marketing CTAs ("Open TikTok", "View post"), and generic buttons are junk — never activation_link.
- Dollar amounts alone do not make a receipt. "Outstanding", "due", "minimum payment", "Capital", "failed", "debit initiated" → failed_payment or alert. Shipment tracking / "has shipped" → junk, never receipt.
- Google Alerts mentioning websites/companies → google_alert, never project/client.

Pick job_slug only when confident; prefer active/inquiry jobs.
For proposed_meeting_start: require BOTH a specific date and a clock time the sender wrote (2pm, 2:00 PM, 14:30). Vague availability must be null. Never invent a time. Deadlines, launch dates, "action required by", maintenance windows, IP/firewall notices, and street addresses (e.g. 600 Congress) are NOT meetings. If label is alert, google_alert, junk, receipt, failed_payment, otp, or activation_link, proposed_meeting_start and scheduling_note MUST be null.
For proposed_meeting_duration_minutes: extract when the sender asks for a length ("an hour", "60 minutes", "15 min"). Leave null when they do not say — do not assume 30.
Attachments: when the body is empty but Attachments are listed, summarize the attached files — never call it blank.`;

  const triageBody = normalizeEmailBody(email.text, email.html);
  const attachmentLines = formatAttachmentListForPrompt(
    normalizeEmailAttachments(email.attachments),
  );
  const receivedAt = receivedAtIso || new Date().toISOString();
  const user = [
    `Received: ${receivedAt}`,
    `From: ${email.from ?? ''}`,
    `Subject: ${email.subject ?? ''}`,
    contactName ? `Known contact: ${contactName}` : 'Known contact: (none — unknown sender)',
    contactKind ? `Contact kind: ${contactKind}` : 'Contact kind: (unknown)',
    `Open jobs for this sender:\n${jobLines}`,
    '',
    'Body:',
    triageBody.slice(0, 4000) || '(empty body)',
    attachmentLines ? `\nAttachments:\n${attachmentLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      console.warn('[email] AI classify HTTP', res.status);
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const label = normalizeLabel(parsed.label ?? parsed.category);
    const confidence = clampConfidence(parsed.confidence);
    const summary =
      String(parsed.summary ?? '').trim() ||
      triageBody.slice(0, 200) ||
      String(email.subject ?? '').trim() ||
      '(no subject)';
    const allowMeeting = !MEETING_SKIP_CATEGORIES.has(mapAiLabelToOutcome(label).category);
    return {
      label,
      confidence,
      summary,
      job_slug: parsed.job_slug != null ? String(parsed.job_slug) : null,
      note_to_append: parsed.note_to_append != null ? String(parsed.note_to_append) : null,
      reason: String(parsed.reason ?? '').trim() || `AI label ${label}`,
      proposed_meeting_start: allowMeeting
        ? parseProposedMeetingStart(parsed.proposed_meeting_start)
        : null,
      scheduling_note:
        allowMeeting && parsed.scheduling_note ? String(parsed.scheduling_note).trim() : null,
      proposed_meeting_duration_minutes: allowMeeting
        ? parseMeetingDurationMinutesField(parsed.proposed_meeting_duration_minutes)
        : null,
    };
  } catch (e) {
    console.warn('[email] AI classify failed', e);
    return null;
  }
}
