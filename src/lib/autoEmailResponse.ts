/**
 * Auto email response — draft inbound replies for owner approval before send.
 *
 * v1: hand review always required. No auto-send hook in the inbound pipeline yet.
 */
import { getCompanyConfig } from './companyConfig';
import { generateComposeDraft } from './composeDraft';
import type { EmailInboxRecord } from './emailInboxStore';
import { storeGetEmailInbox } from './emailInboxStore';
import { sendInboundThreadReply } from './inboundEmailReply';
import { hasFeature } from './features';
import { isEmailSendConfigured } from './outbound';
import { serverEnv } from './serverEnv';
import {
  createAutoEmailResponseDraft,
  getAutoEmailResponseDraft,
  listPendingAutoEmailResponseDrafts,
  markAutoEmailResponseDraftApproved,
  markAutoEmailResponseDraftRejected,
  type AutoEmailResponseDraftRecord,
  type AutoEmailResponseDraftStatus,
} from './autoEmailResponseStore';

export type AutoEmailResponsePolicy = {
  /** Always true in v1 — every send goes through approve API. */
  requiresHumanReview: boolean;
  /** Reserved for a future opt-in auto-send path. Always false today. */
  autoSendAllowed: boolean;
};

/** Module is enabled on this install. */
export function isAutoEmailResponseFeatureEnabled(): boolean {
  return hasFeature('auto_email_response');
}

/** Feature on + Resend configured. */
export function isAutoEmailResponseConfigured(): boolean {
  return isAutoEmailResponseFeatureEnabled() && isEmailSendConfigured();
}

/**
 * Outbound policy for this install. Hand review is mandatory regardless of env.
 */
export function autoEmailResponsePolicy(): AutoEmailResponsePolicy {
  const envAutoSend = serverEnv('AUTO_EMAIL_REPLY_ENABLED') === '1';
  return {
    requiresHumanReview: true,
    autoSendAllowed: false && envAutoSend,
  };
}

export function isAutoEmailResponseDraftPending(
  status: AutoEmailResponseDraftStatus | string | null | undefined,
): boolean {
  return String(status || '').trim().toLowerCase() === 'pending';
}

export type QueueAutoEmailResponseInput = {
  inboxEmailId: string;
  /** Optional staff notes passed into the compose prompt. */
  staffNotes?: string;
  createdBy?: string | null;
};

/**
 * Generate a reply draft for an inbox row and queue it for owner review.
 * Does not send.
 */
export async function queueAutoEmailResponseDraft(
  input: QueueAutoEmailResponseInput,
): Promise<
  | { ok: true; draft: AutoEmailResponseDraftRecord }
  | { ok: false; error: string; status?: number }
> {
  if (!isAutoEmailResponseFeatureEnabled()) {
    return { ok: false, error: 'Auto email response module is not enabled', status: 404 };
  }

  const inboxId = String(input.inboxEmailId || '').trim();
  if (!inboxId) return { ok: false, error: 'inboxEmailId is required', status: 400 };

  const inbox = await storeGetEmailInbox(inboxId);
  if (!inbox) return { ok: false, error: 'Inbox message not found', status: 404 };

  const existing = await getAutoEmailResponseDraftByInboxId(inboxId);
  if (existing && isAutoEmailResponseDraftPending(existing.status)) {
    return { ok: true, draft: existing };
  }

  const company = await getCompanyConfig();
  const companyName = company.name?.trim() || 'the company';
  const from = inbox.from?.trim() || '';
  const subject = inbox.subject?.trim() || '';
  const body = inbox.bodyText?.trim() || inbox.bodySnippet?.trim() || '';

  const generated = await generateComposeDraft({
    kind: 'email',
    companyName,
    to: from,
    subject,
    currentBody: input.staffNotes?.trim() || undefined,
    incoming: from || subject || body ? { from, subject, body } : undefined,
  });

  if (!generated.ok) return { ok: false, error: generated.error, status: 502 };

  const draft = await createAutoEmailResponseDraft({
    inboxEmailId: inboxId,
    toEmail: from,
    subject: generated.draft.subject?.trim() || subject,
    body: generated.draft.body,
    createdBy: input.createdBy ?? null,
  });

  return { ok: true, draft };
}

export async function getAutoEmailResponseDraftByInboxId(
  inboxEmailId: string,
): Promise<AutoEmailResponseDraftRecord | null> {
  const rows = await listPendingAutoEmailResponseDrafts(500);
  const id = String(inboxEmailId || '').trim();
  return rows.find((row) => row.inboxEmailId === id) ?? null;
}

export async function listAutoEmailResponseQueue(
  limit = 100,
): Promise<AutoEmailResponseDraftRecord[]> {
  return listPendingAutoEmailResponseDrafts(limit);
}

export type ApproveAutoEmailResponseInput = {
  draftId: string;
  /** Optional edits before send. */
  subject?: string;
  body?: string;
  approvedBy: string;
};

/**
 * Owner-approved send. Fails if review is bypassed or module/resend unavailable.
 */
export async function approveAutoEmailResponseDraft(
  input: ApproveAutoEmailResponseInput,
): Promise<
  | { ok: true; draft: AutoEmailResponseDraftRecord; resendId?: string }
  | { ok: false; error: string; status?: number }
> {
  if (!isAutoEmailResponseConfigured()) {
    return { ok: false, error: 'Auto email response is not configured', status: 503 };
  }

  const policy = autoEmailResponsePolicy();
  if (!policy.requiresHumanReview && !input.approvedBy?.trim()) {
    return { ok: false, error: 'Approval requires a signed-in user', status: 403 };
  }

  const draft = await getAutoEmailResponseDraft(input.draftId);
  if (!draft) return { ok: false, error: 'Draft not found', status: 404 };
  if (!isAutoEmailResponseDraftPending(draft.status)) {
    return { ok: false, error: `Draft is already ${draft.status}`, status: 409 };
  }

  const inbox = await storeGetEmailInbox(draft.inboxEmailId);
  if (!inbox) return { ok: false, error: 'Linked inbox message not found', status: 404 };

  const subject = String(input.subject ?? draft.subject).trim();
  const body = String(input.body ?? draft.body).trim();
  if (!body) return { ok: false, error: 'Reply body is required', status: 400 };

  const sendResult = await sendInboundThreadReply(inbox, { subject, text: body });
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error, status: 502 };
  }

  const updated = await markAutoEmailResponseDraftApproved({
    id: draft.id,
    subject,
    body,
    approvedBy: input.approvedBy,
    resendId: sendResult.emailId ?? null,
  });

  if (!updated) return { ok: false, error: 'Failed to update draft after send', status: 500 };

  return { ok: true, draft: updated, resendId: sendResult.emailId };
}

export async function rejectAutoEmailResponseDraft(
  draftId: string,
  rejectedBy: string,
): Promise<
  | { ok: true; draft: AutoEmailResponseDraftRecord }
  | { ok: false; error: string; status?: number }
> {
  if (!isAutoEmailResponseFeatureEnabled()) {
    return { ok: false, error: 'Auto email response module is not enabled', status: 404 };
  }

  const draft = await getAutoEmailResponseDraft(draftId);
  if (!draft) return { ok: false, error: 'Draft not found', status: 404 };
  if (!isAutoEmailResponseDraftPending(draft.status)) {
    return { ok: false, error: `Draft is already ${draft.status}`, status: 409 };
  }

  const updated = await markAutoEmailResponseDraftRejected({
    id: draftId,
    rejectedBy,
  });
  if (!updated) return { ok: false, error: 'Failed to reject draft', status: 500 };

  return { ok: true, draft: updated };
}

/**
 * Integration hook for inbound triage — not wired yet.
 * Call after classification when rules request an auto-reply draft.
 */
export async function maybeQueueAutoEmailResponseFromInbox(
  _inbox: EmailInboxRecord,
): Promise<AutoEmailResponseDraftRecord | null> {
  if (!isAutoEmailResponseFeatureEnabled()) return null;
  // Pipeline hook lands in a follow-up — drafts are queued via API for now.
  return null;
}
