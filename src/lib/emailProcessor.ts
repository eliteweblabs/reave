/**
 * Inbound email intelligence: summarize, classify junk, route client mail to jobs.
 */

import { serverEnv } from './serverEnv';
import { parseSenderEmail } from './emailAddress';
import {
  evaluateEmailRules,
  isAuthLinkRuleStatus,
  isSilentTriageStatus,
  isUptimeRobotEmail,
  isVerificationCodeRuleStatus,
  resolveRuleNotifyActions,
  resolveRuleNotifyChannels,
  type InboundEmail,
  type RuleEvaluation,
} from './emailRules';
import { incrementEmailRuleHit, loadActiveEmailRules, type EmailRuleRecord } from './emailRuleStore';
import { ruleAllowsAutoProject } from './emailFilterRuleWrite';
import { ensureContactForMeetingEmail } from './emailContactExtract';
import { tryAutoCreateProjectFromInboundEmail } from './emailProjectAuto';
import { importEmailAttachmentsToProject } from './emailProjectAttachments';
import { ensureProjectForMeetingEmail } from './emailMeetingProject';
import { resolveContact, getContact, getClientKind, siteBaseUrl, type ClientKind } from './contactApi';
import { storeListWork, storeAppendWorkNote } from './workStore';
import type { WorkJobSummary } from './workStore';
import { storeRecordEmailInbox, storeUpdateEmailInbox, type EmailInboxRecord } from './emailInboxStore';
import { linkProjectItem } from './projectLinks';
import { hasFeature } from './features';
import { detectMeetingFollowUp } from './emailMeetingFollowup';
import { attendeeFromEmail, buildNewProjectAckEmail, formatMeetingWhenLabel, tryAutoBookInboundMeeting } from './emailScheduling';
import {
  MEETING_SKIP_CATEGORIES,
  parseProposedMeetingStart,
  sanitizeInboundMeetingProposal,
} from './emailMeetingParse';
import { sendInboxPushNotification } from './webPush';
import {
  notifyAdminAgentOfEmailAlert,
  notifyAdminAgentOfEmailAutomation,
  notifyAdminAgentOfProjectReply,
  isRailwayAlertStatus,
  shouldAgentAlertForInboundEmail,
} from './adminAgentAlert';
import { getCompanyConfig } from './companyConfig';
import { sendInboundThreadReply, scheduleFormUrl } from './inboundEmailReply';
import { inboxPreviewSnippet, normalizeEmailBody, normalizeEmailHtml } from './emailBody';
import {
  detectProjectClientReply,
  displayProjectTitle,
  isLikelyClientThreadReply,
} from './emailProjectReply';
import { isSuggestedProjectMatch, projectMatchSuggestedReviewCopy } from './emailAutomation';
import {
  looksLikeFailedOrDuePayment,
  looksLikeIncomingPayment,
  looksLikePaymentNotification,
  looksLikeShipmentNotice,
  shouldAutoFileAsReceipt,
} from './emailMoney';
import {
  auditForMatchedRule,
  classificationAuditStep,
  findShipmentArchiveRule,
  type ClassificationAuditStep,
  type ClassificationRuleLink,
} from './emailClassificationAudit';
import {
  describeOtpPurpose,
  extractVerificationCodeFromEmail,
  formatOtpPushNotification,
} from './emailOtpParser';
import {
  describeAuthLinkPurpose,
  extractAuthActionUrl,
  formatAuthLinkPushNotification,
  isAuthLinkEmail,
} from './emailAuthLinkParser';
import {
  aiConfidenceThreshold,
  mapAiLabelToOutcome,
  runAiClassify,
  shouldAgentFirstClassify,
  type AiClassifyResult,
} from './emailAiClassify';
import { findPriorInboxInThread, shouldSuppressDuplicateMeetingAlert } from './emailThreadDedup';
import {
  attachmentSummaryFallback,
  formatAttachmentListForPrompt,
  normalizeEmailAttachments,
} from './emailAttachments';
import { enforceNotificationNotJunk, isJunkClassification } from './emailJunkNotifyInvariant';
import { dismissEmailRelatedNotifications } from './emailNotificationSync';

/** ISO timestamp for OTP / auth-link auto-delete, or null when disabled. TTL from admin Settings (fallback: `EMAIL_OTP_TTL_MINUTES` / 5). */
export async function verificationCodeDeleteAfterAt(): Promise<string | null> {
  const { getOtpTtlMinutes } = await import('./appSettingsStore');
  const min = await getOtpTtlMinutes();
  if (!Number.isFinite(min) || min <= 0) return null;
  const clamped = Math.max(1, Math.min(min, 1440));
  return new Date(Date.now() + clamped * 60_000).toISOString();
}

export type EmailCategory = 'junk' | 'client' | 'alert' | 'internal' | 'review' | 'receipt' | 'project' | 'otp' | 'auth_link';

export interface ProcessedEmailResult {
  ok: boolean;
  category: EmailCategory;
  status: string;
  action: string;
  from: string;
  record: EmailInboxRecord | null;
  /** Present when triage ran with dryRun — no inbox/push/booking side effects. */
  dryRun?: boolean;
  classificationAudit?: ClassificationAuditStep[];
  ruleEvaluations?: RuleEvaluation[];
  summary?: string;
  routeNote?: string;
  contactUid?: string | null;
  contactName?: string | null;
  clientKind?: ClientKind | null;
  jobSlug?: string | null;
  jobTitle?: string | null;
  automationKind?: string | null;
  verificationCode?: string | null;
  actionUrl?: string | null;
  needsExplain?: boolean;
  wouldNotify?: boolean;
  wouldAgentAlert?: boolean;
  wouldForwardTo?: string | null;
  aiClassify?: AiClassifyResult | null;
  proposedMeetingStart?: string | null;
  deleteAfterAt?: string | null;
}

export type ProcessInboundOptions = {
  /** Classify/route only — skip persist, push, forward, booking, contact create, project create. */
  dryRun?: boolean;
  /** Override live rule table (same `classifyEmail` / `evaluateEmailRules` path). */
  rules?: import('./emailRules').EmailRule[];
  notifyOnUnmatched?: boolean;
  /** Preserve the original inbox arrival time (sleep-mode morning catch-up). */
  receivedAt?: string;
  /** Update this inbox row in place instead of inserting a new one. */
  existingInboxId?: string;
};

function snippet(text: string, max = 500): string {
  return inboxPreviewSnippet(text, max);
}

function aiEnabled(): boolean {
  if (serverEnv('EMAIL_AI_ENABLED') === '0') return false;
  return Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim());
}

function ruleCategory(status: string): EmailCategory {
  const s = status.toUpperCase();
  if (s === 'DELETE') return 'junk';
  if (s === 'AUTO_ARCHIVED') return 'internal';
  if (s === 'RECEIPT') return 'receipt';
  if (isOperationalAlertStatus(s)) return 'alert';
  return 'review';
}


function isOperationalAlertStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s.startsWith('RAILWAY') || s === 'DOWN' || s === 'NEEDS_CHECK' || s === 'ANTHROPIC_BILLING';
}

function shouldSkipAutoReceipt(opts: {
  category: EmailCategory;
  ruleStatus: string;
  isProjectReply: boolean;
}): boolean {
  if (opts.isProjectReply) return true;
  if (opts.category === 'junk') return true;
  if (opts.category === 'alert') return true;
  if (opts.ruleStatus.toUpperCase() === 'AUTO_ARCHIVED') return true;
  if (isOperationalAlertStatus(opts.ruleStatus)) return true;
  return false;
}

type AiTriage = {
  category: EmailCategory;
  summary: string;
  job_slug: string | null;
  note_to_append: string | null;
  reason: string;
  proposed_meeting_start: string | null;
  scheduling_note: string | null;
  proposed_meeting_duration_minutes?: number | null;
};

async function runAiTriage(
  email: InboundEmail,
  jobs: WorkJobSummary[],
  contactName: string | null,
  receivedAtIso?: string,
): Promise<AiTriage | null> {
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

  const system = `You triage inbound email for a web design / dev business owner.
Respond with ONLY valid JSON (no markdown fences):
{
  "category": "junk" | "client" | "alert" | "internal" | "review",
  "summary": "1-2 sentences the owner reads instead of the full email",
  "job_slug": "slug from the job list below, or null",
  "note_to_append": "project-relevant facts to append to the job file, or null",
  "reason": "short routing explanation",
  "proposed_meeting_start": "ISO 8601 datetime with offset when the email proposes a concrete meeting date AND time, otherwise null",
  "scheduling_note": "short human phrase for the proposed meeting time AND length when stated (e.g. Tuesday 2pm for 1 hour), or null when not scheduling",
  "proposed_meeting_duration_minutes": "integer minutes when the email states a meeting length (60 for an hour, 30 for half hour); null when unspecified"
}
Categories:
- junk: marketing, newsletters, spam, bulk list mail (not tax receipts — those may be filed separately). NEVER use junk when Known contact is set — those senders stay visible (internal or review) unless a keyword rule files them.
- client: client project updates, requests, files, approvals
- alert: uptime, security, monitoring, auth warnings
- internal: personal/admin not tied to a client job
- review: ambiguous — needs human decision
Pick job_slug only when confident; prefer active/inquiry jobs.
For proposed_meeting_start: require BOTH a specific date and a clock time the sender stated (2pm, 14:30). Use the Received timestamp to resolve relative phrases. "Next week Tuesday" means Tuesday of the following calendar week, not the nearest Tuesday. "Next Tuesday" skips the imminent Tuesday (e.g. on Monday, next Tuesday is 8 days out). Vague availability ("let's find a time") with no day/time must be null. Never invent a time. Deadlines, launch dates, "action required by", maintenance windows, IP/firewall changes, and street addresses (e.g. 600 Congress) are NOT meetings. If category is alert, junk, or receipt, both meeting fields MUST be null.
For proposed_meeting_duration_minutes: extract when the sender asks for a length ("an hour", "60 minutes", "quick 15 min"). Leave null when they do not say — do not assume 30.
Attachments: when the body is empty or signature-only but Attachments are listed below, the email is NOT blank — summarize that the sender attached those files (name them). Never describe an email as empty/blank when attachments are present.`;

  const triageBody = normalizeEmailBody(email.text, email.html);
  const attachmentLines = formatAttachmentListForPrompt(
    normalizeEmailAttachments(email.attachments),
  );
  const receivedAt = receivedAtIso || new Date().toISOString();
  const user = [
    `Received: ${receivedAt}`,
    `From: ${email.from ?? ''}`,
    `Subject: ${email.subject ?? ''}`,
    contactName ? `Known contact: ${contactName}` : '',
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
      console.warn('[email] AI triage HTTP', res.status);
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    const parsed = JSON.parse(text) as AiTriage;
    const cat = parsed.category;
    if (!['junk', 'client', 'alert', 'internal', 'review'].includes(cat)) {
      parsed.category = 'review';
    }
    parsed.summary = String(parsed.summary ?? '').trim() || snippet(triageBody || email.subject || '');
    parsed.scheduling_note = parsed.scheduling_note
      ? String(parsed.scheduling_note).trim()
      : null;
    parsed.proposed_meeting_start = parseProposedMeetingStart(parsed.proposed_meeting_start);
    const durationRaw = (parsed as { proposed_meeting_duration_minutes?: unknown })
      .proposed_meeting_duration_minutes;
    const durationNum =
      typeof durationRaw === 'number'
        ? durationRaw
        : typeof durationRaw === 'string' && durationRaw.trim()
          ? Number(durationRaw)
          : NaN;
    parsed.proposed_meeting_duration_minutes =
      Number.isFinite(durationNum) && durationNum >= 5 && durationNum <= 480
        ? Math.round(durationNum)
        : null;
    return parsed;
  } catch (e) {
    console.warn('[email] AI triage failed', e);
    return null;
  }
}

function extractContact(data: unknown): { uid: string; name: string; email: string | null } | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as { match?: string; contact?: { uid?: string; name?: string; email?: string | null } };
  if (o.match === 'exact' && o.contact?.uid) {
    return {
      uid: String(o.contact.uid),
      name: String(o.contact.name ?? '').trim() || 'Client',
      email: o.contact.email != null ? String(o.contact.email) : null,
    };
  }
  return null;
}

export async function resolveSenderContact(senderEmail: string): Promise<{
  uid: string | null;
  name: string | null;
  emailOnRecord: string | null;
  clientKind: ClientKind | null;
}> {
  if (!senderEmail.includes('@')) {
    return { uid: null, name: null, emailOnRecord: null, clientKind: null };
  }
  const contactRes = await resolveContact({ email: senderEmail });
  const contact = contactRes.ok ? extractContact(contactRes.data) : null;
  if (!contact) {
    return { uid: null, name: null, emailOnRecord: null, clientKind: null };
  }
  let clientKind: ClientKind | null = null;
  const full = await getContact(contact.uid).catch(() => null);
  if (full?.ok) {
    clientKind = getClientKind(full.data);
  }
  return {
    uid: contact.uid,
    name: contact.name,
    emailOnRecord: contact.email,
    clientKind,
  };
}

function meetingFieldsAllowedForAiLabel(label: AiClassifyResult['label']): boolean {
  return !MEETING_SKIP_CATEGORIES.has(mapAiLabelToOutcome(label).category);
}

function applyMeetingProposal(opts: {
  category: EmailCategory;
  proposedMeetingStart: string | null;
  schedulingNote: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
}): { proposedMeetingStart: string | null; schedulingNote: string; discardedReason: string | null } {
  return sanitizeInboundMeetingProposal({
    category: opts.category,
    proposedMeetingStart: opts.proposedMeetingStart,
    schedulingNote: opts.schedulingNote,
    subject: opts.subject,
    bodyText: opts.bodyText,
    receivedAt: opts.receivedAt,
  });
}

function applyTrustedAiClassify(opts: {
  ai: AiClassifyResult;
  from: string;
  subject: string;
  bodyText: string;
  html?: string;
  verificationCode: string | null;
}): {
  category: EmailCategory;
  action: string;
  inboxStatus: string;
  summary: string;
  routeNote: string;
  isVerificationCode: boolean;
  isAuthLink: boolean;
  authActionUrl: string | null;
  otpPurpose: string | null;
  authLinkPurpose: string | null;
  proposedMeetingStart: string | null;
  schedulingNote: string;
  proposedMeetingDurationMinutes: number | null;
  aiJobSlug: string | null;
  aiNote: string | null;
} {
  const mapped = mapAiLabelToOutcome(opts.ai.label);
  let isVerificationCode = opts.ai.label === 'otp';
  let isAuthLink = opts.ai.label === 'activation_link';
  let authActionUrl: string | null = null;
  let otpPurpose: string | null = null;
  let authLinkPurpose: string | null = null;
  let summary = opts.ai.summary;
  let routeNote = opts.ai.reason || `AI ${opts.ai.label} (${Math.round(opts.ai.confidence * 100)}%)`;

  if (isVerificationCode) {
    if (opts.verificationCode) {
      // purpose filled by caller with company name when available
    } else {
      // Model said OTP but no digits — keep review-ish otp banner without code.
      routeNote = `${routeNote} · no code parsed`;
    }
  }

  if (isAuthLink) {
    authActionUrl =
      extractAuthActionUrl({
        from: opts.from,
        subject: opts.subject,
        text: opts.bodyText,
        html: opts.html,
      })?.url ?? null;
  }

  return {
    category: mapped.category,
    action: mapped.action,
    inboxStatus: mapped.status,
    summary,
    routeNote,
    isVerificationCode,
    isAuthLink,
    authActionUrl,
    otpPurpose,
    authLinkPurpose,
    proposedMeetingStart: meetingFieldsAllowedForAiLabel(opts.ai.label)
      ? opts.ai.proposed_meeting_start
      : null,
    schedulingNote: meetingFieldsAllowedForAiLabel(opts.ai.label)
      ? opts.ai.scheduling_note ?? ''
      : '',
    proposedMeetingDurationMinutes: meetingFieldsAllowedForAiLabel(opts.ai.label)
      ? opts.ai.proposed_meeting_duration_minutes ?? null
      : null,
    aiJobSlug: opts.ai.job_slug,
    aiNote: opts.ai.note_to_append,
  };
}

function pickJobSlug(
  aiSlug: string | null | undefined,
  jobs: WorkJobSummary[],
  subject: string,
): WorkJobSummary | null {
  if (!jobs.length) return null;
  const slug = aiSlug?.trim().toLowerCase();
  if (slug) {
    const hit = jobs.find((j) => j.slug.toLowerCase() === slug);
    if (hit) return hit;
  }
  const sub = subject.toLowerCase();
  const byTitle = jobs.find((j) => sub.includes(j.title.toLowerCase().slice(0, 20)));
  if (byTitle) return byTitle;
  const active = jobs.filter(
    (j) => j.status === 'active' || j.status === 'audit' || j.status === 'inquiry',
  );
  if (active.length === 1) return active[0]!;
  return null;
}

/** Whether this triage outcome needs a phone push (skip junk, silent rules, auto-routed). */
export function shouldSendInboxPush(opts: {
  category: EmailCategory;
  action: string;
  ruleNotify: boolean;
  ruleStatus: string;
  isProjectReply?: boolean;
  automationKind?: string | null;
}): boolean {
  // Hard rule: junk / DELETE / auto-archive never notify — not even when a
  // later meeting/project automation flag is set. Dashboard + push stay empty.
  if (
    isJunkClassification({
      category: opts.category,
      action: opts.action,
      status: opts.ruleStatus,
    })
  ) {
    return false;
  }

  if (opts.isProjectReply) return true;
  if (
    opts.automationKind === 'meeting_booked' ||
    opts.automationKind === 'project_created' ||
    opts.automationKind === 'project_match_suggested' ||
    opts.automationKind === 'meeting_followup' ||
    opts.automationKind === 'meeting_request' ||
    opts.automationKind === 'meeting_conflict'
  ) {
    return true;
  }

  const action = opts.action.toLowerCase();
  const status = opts.ruleStatus.toUpperCase();

  // No keyword rule → inbox only. Do not also ping dashboard / agent.
  if (status === 'UNMATCHED' && !opts.isProjectReply && !opts.automationKind) return false;
  if (action === 'needs_explain') return true;
  if (opts.category === 'receipt') return false;
  if (opts.action === 'verification_code' || opts.action === 'activation_link') return false;
  if (opts.category === 'otp' || opts.category === 'auth_link') return false;
  if (isVerificationCodeRuleStatus(opts.ruleStatus) || isAuthLinkRuleStatus(opts.ruleStatus)) return false;
  if (!opts.ruleNotify) return false;
  if (status === 'DELETE' || status === 'AUTO_ARCHIVED') return false;
  // Auto-sorted to a job — visible under Routed, no ping needed (except urgent project replies).
  if (action === 'filed' || action === 'matched') return false;
  // Auto-booked meeting — owner should review and confirm with the sender.
  if (action === 'booked') return true;

  return true;
}

/** Branded acknowledgment to the client after auto-creating a project from their email. */
async function sendAutoProjectAckEmail(opts: {
  inboxRecord: EmailInboxRecord;
  jobSlug: string;
  jobTitle: string;
  contactName: string | null;
  summary: string;
  subject: string;
  from: string;
}): Promise<void> {
  try {
    const company = await getCompanyConfig();
    const attendee = attendeeFromEmail({ from: opts.from, contactName: opts.contactName });
    const scheduleUrl = hasFeature('scheduling')
      ? scheduleFormUrl(siteBaseUrl(), { name: attendee.name, email: attendee.email })
      : null;
    const mail = await buildNewProjectAckEmail({
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      jobTitle: opts.jobTitle,
      summary: opts.summary,
      subject: opts.subject,
      companyName: company.name,
      scheduleUrl,
    });
    const sent = await sendInboundThreadReply(opts.inboxRecord, mail, {
      jobSlug: opts.jobSlug,
      contactUid: opts.inboxRecord.contactUid,
      source: 'auto_project_ack',
    });
    if (!sent.ok) {
      console.warn('[email] auto project ack failed', sent.error);
    }
  } catch (e) {
    console.warn('[email] auto project ack failed', e);
  }
}

export async function processInboundEmail(
  email: InboundEmail,
  options?: ProcessInboundOptions,
): Promise<ProcessedEmailResult> {
  const dryRun = options?.dryRun === true;
  const receivedAt = options?.receivedAt || new Date().toISOString();
  const from = email.from ?? '';
  const senderEmail = parseSenderEmail(from);
  const bodyText = normalizeEmailBody(email.text, email.html);
  const bodyHtml = normalizeEmailHtml(email.text, email.html);
  const attachments = normalizeEmailAttachments(email.attachments);
  const verificationCode =
    extractVerificationCodeFromEmail({
      from,
      subject: email.subject,
      text: bodyText,
      html: email.html,
    })?.code ?? null;

  const sender = await resolveSenderContact(senderEmail);
  let contactUid = sender.uid;
  let contactName = sender.name;
  const contactEmailOnRecord = sender.emailOnRecord;
  const clientKind = sender.clientKind;
  const knownContact = Boolean(contactUid);

  const loaded = await loadActiveEmailRules();
  const rules = options?.rules ?? loaded.rules;
  const notifyOnUnmatched =
    options?.notifyOnUnmatched !== undefined
      ? options.notifyOnUnmatched
      : loaded.notifyOnUnmatched;
  const ruleWalk = evaluateEmailRules(email, rules, notifyOnUnmatched, { knownContact });
  const ruleResult = ruleWalk.classification;
  const noKeywordRule = ruleResult.matched == null;
  const matchedId = (ruleResult.matched as EmailRuleRecord | null)?.id;
  if (matchedId && !dryRun) {
    void incrementEmailRuleHit(matchedId).catch((e) => {
      console.error('[email] rule hit increment failed', e);
    });
  }
  const classificationAudit: ClassificationAuditStep[] = [
    classificationAuditStep(
      'contact',
      knownContact
        ? `Known contact${contactName ? `: ${contactName}` : ''}`
        : 'Unknown sender',
      knownContact
        ? 'Green light — catalog junk does not apply; personal DELETE rules still run'
        : 'Not in Contacts — catalog junk and AI may file as junk',
    ),
    auditForMatchedRule(ruleResult.matched, ruleResult.status, {
      from,
      subject: email.subject ?? '',
      text: bodyText,
    }),
  ];
  if (dryRun) {
    classificationAudit.unshift(
      classificationAuditStep(
        'simulate',
        'Dry-run — no inbox, push, forward, or booking side effects',
        'Same classifyEmail / processInboundEmail path the Agent uses',
      ),
    );
  }
  const pushAudit = (
    step: string,
    decision: string,
    detail?: string,
    link?: ClassificationRuleLink,
  ) => {
    classificationAudit.push(classificationAuditStep(step, decision, detail, link));
  };
  const matchedRuleRecord = ruleResult.matched as EmailRuleRecord | null;
  const matchedRuleLink: ClassificationRuleLink | undefined = matchedRuleRecord?.id
    ? { ruleId: matchedRuleRecord.id, ruleTitle: matchedRuleRecord.title }
    : undefined;
  const shipmentRule = findShipmentArchiveRule(rules as EmailRuleRecord[]);
  const shipmentRuleLink: ClassificationRuleLink | undefined = shipmentRule?.id
    ? { ruleId: shipmentRule.id, ruleTitle: shipmentRule.title }
    : undefined;

  const skippedCatalogJunk = ruleWalk.evaluations.find((e) => e.outcome === 'skipped_known_contact');
  if (skippedCatalogJunk) {
    pushAudit(
      'contact',
      'Known contact skipped catalog junk',
      skippedCatalogJunk.rule.description ||
        'Unsubscribe / opt-out catch-all does not apply to Contacts',
    );
  }

  // Silent first-match (DELETE / notify:false) hard-stops triage — AI must not
  // re-label Google/service mail as alert and re-open dashboard/push.
  const ruleSilencesNotifications =
    ruleResult.matched != null &&
    (!ruleResult.notify || isSilentTriageStatus(ruleResult.status));

  const jobs =
    contactUid != null
      ? (await storeListWork({ contact_uid: contactUid })).filter(
          (j) => j.status !== 'archived',
        )
      : [];

  const agentFirst =
    !ruleSilencesNotifications &&
    shouldAgentFirstClassify({
      hasContact: Boolean(contactUid),
      clientKind,
    });
  const confidenceMin = aiConfidenceThreshold();
  let aiTrusted = false;
  let needsExplain = false;
  let aiClassify: AiClassifyResult | null = null;

  if (ruleSilencesNotifications) {
    pushAudit(
      'rules',
      `Silent rule short-circuit: ${ruleResult.status}`,
      'notify:false / DELETE — skip agent-first AI override',
      matchedRuleLink,
    );
  }

  if (agentFirst && aiEnabled()) {
    aiClassify = await runAiClassify(email, jobs, contactName, clientKind, receivedAt);
    if (aiClassify && aiClassify.label === 'junk' && knownContact) {
      pushAudit(
        'contact',
        'Known contact blocked AI junk',
        aiClassify.reason || 'AI labeled junk; remapped to internal',
      );
      aiClassify = {
        ...aiClassify,
        label: 'internal',
        reason: `Known contact — not junk. ${aiClassify.reason}`.trim(),
      };
    }
    if (aiClassify && aiClassify.confidence >= confidenceMin) {
      aiTrusted = true;
    } else {
      needsExplain = true;
    }
  }

  // Auth CTA URL — scraped for Activate UX, but never classifies alone (TikTok "Open …" FPs).
  let authActionUrl: string | null = null;

  let isVerificationCode = false;
  let isAuthLink = false;
  let otpPurpose: string | null = null;
  let authLinkPurpose: string | null = null;

  let category: EmailCategory = ruleCategory(ruleResult.status);
  let summary =
    ruleResult.matched?.summaryOverride ||
    snippet(bodyText) ||
    attachmentSummaryFallback(attachments) ||
    email.subject ||
    '(no subject)';
  let jobSlug: string | null = null;
  let jobTitle: string | null = null;
  let routeNote = '';
  let action = ruleResult.status.toUpperCase() === 'AUTO_ARCHIVED' ? 'filed' : 'classified';
  let proposedMeetingStart: string | null = null;
  let schedulingNote = '';
  let proposedMeetingDurationMinutes: number | null = null;
  let bookingUid: string | null = null;
  let bookingStart: string | null = null;
  let automationKind: string | null = null;
  let inboxStatusOverride: string | null = null;

  const forwardTo = ruleResult.matched?.forwardTo?.trim() || null;
  if (forwardTo) {
    if (dryRun) {
      pushAudit('forward', `Would forward to ${forwardTo}`, 'Dry-run — Resend forward skipped');
    } else {
      const { forwardEmail } = await import('./emailForward');
      const fwd = await forwardEmail(email, forwardTo);
      if (!fwd.ok) {
        console.warn('[email] rule forward failed', {
          from,
          subject: email.subject,
          forwardTo,
          error: fwd.error,
        });
      }
    }
  }

  let isProjectReply = false;

  if (aiTrusted && aiClassify) {
    const applied = applyTrustedAiClassify({
      ai: aiClassify,
      from,
      subject: email.subject ?? '',
      bodyText,
      html: email.html,
      verificationCode,
    });
    const aiHay = `${aiClassify.label} ${aiClassify.reason || ''} ${applied.routeNote || ''}`;
    const aiRuleLink = /shipment|shipping notice|not a tax receipt|has shipped/i.test(aiHay)
      ? shipmentRuleLink
      : matchedRuleLink;
    pushAudit(
      'ai',
      `Trusted AI label: ${aiClassify.label}`,
      `${Math.round(aiClassify.confidence * 100)}% confidence · ${aiClassify.reason || applied.routeNote}`,
      aiRuleLink,
    );
    category = applied.category;
    action = applied.action;
    summary = applied.summary;
    routeNote = applied.routeNote;
    inboxStatusOverride = applied.inboxStatus;
    isVerificationCode = applied.isVerificationCode;
    isAuthLink = applied.isAuthLink;
    authActionUrl = applied.authActionUrl;
    proposedMeetingStart = applied.proposedMeetingStart;
    schedulingNote = applied.schedulingNote;
    proposedMeetingDurationMinutes = applied.proposedMeetingDurationMinutes;

    if (isVerificationCode) {
      const company = await getCompanyConfig().catch(() => null);
      otpPurpose = describeOtpPurpose(
        { from, subject: email.subject, text: bodyText, html: email.html },
        company?.name,
      );
      if (verificationCode) {
        summary = otpPurpose
          ? `${otpPurpose}: ${verificationCode} — tap to copy`
          : `Code: ${verificationCode} — tap to copy`;
      }
      routeNote = routeNote || 'Verification code — tap to copy; auto-deletes in 5 min';
    } else if (isAuthLink) {
      const company = await getCompanyConfig().catch(() => null);
      authLinkPurpose = describeAuthLinkPurpose(
        { from, subject: email.subject, text: bodyText, html: email.html },
        company?.name,
      );
      summary = authLinkPurpose
        ? `${authLinkPurpose} — tap Activate`
        : 'Activation link — tap Activate';
      routeNote =
        routeNote ||
        (authActionUrl
          ? 'Activation link — tap Activate; email deletes after use'
          : 'Activation link — open Email tab; auto-deletes soon');
    } else if (
      looksLikeShipmentNotice({
        from,
        subject: email.subject ?? '',
        summary,
        bodyText,
      })
    ) {
      category = 'internal';
      action = 'filed';
      inboxStatusOverride = 'AUTO_ARCHIVED';
      routeNote = 'Shipment tracking — auto-archived (not a tax receipt)';
      if (shipmentRuleLink) {
        pushAudit(
          'correction',
          'Shipment tracking — not a tax receipt',
          'Shipping / package-tracked notices auto-archive',
          shipmentRuleLink,
        );
      }
    } else if (
      aiClassify.label === 'failed_payment' ||
      looksLikeFailedOrDuePayment({
        from,
        subject: email.subject ?? '',
        summary,
        bodyText,
      })
    ) {
      category = 'alert';
      action = 'failed_payment';
      inboxStatusOverride = 'FAILED_PAYMENT';
    }

    // Job append for trusted client labels
    if (
      (aiClassify.label === 'client' || aiClassify.label === 'project') &&
      applied.aiJobSlug
    ) {
      const job = pickJobSlug(applied.aiJobSlug, jobs, email.subject ?? '');
      if (job && applied.aiNote?.trim()) {
        if (dryRun) {
          jobSlug = job.slug;
          jobTitle = job.title;
          action = 'filed';
          category = 'client';
          routeNote = `Would append to job "${job.title}"`;
          pushAudit('job', `Would append note to "${job.title}"`, 'Dry-run — job body not modified');
        } else {
          const appended = await storeAppendWorkNote(job.slug, applied.aiNote.trim(), {
            subject: email.subject ?? '',
            from: senderEmail,
          });
          if (appended.ok) {
            jobSlug = job.slug;
            jobTitle = job.title;
            action = 'filed';
            category = 'client';
            routeNote = `Appended to job "${job.title}"`;
          }
        }
      } else if (job) {
        jobSlug = job.slug;
        jobTitle = job.title;
        action = 'matched';
        category = 'client';
        routeNote = routeNote || `Matched job "${job.title}" (no note extracted)`;
      }
    }

    // Meeting times must appear as clock times in the email — never invent from
    // deadlines, IP addresses, or street numbers (e.g. 600 Congress → 6:00 AM).
    const meeting = applyMeetingProposal({
      category,
      proposedMeetingStart,
      schedulingNote,
      subject: email.subject ?? '',
      bodyText,
      receivedAt,
    });
    if (meeting.discardedReason) {
      pushAudit('meeting', 'Discarded invented meeting time', meeting.discardedReason);
    }
    proposedMeetingStart = meeting.proposedMeetingStart;
    schedulingNote = meeting.schedulingNote;
  } else {
    // Rules / parser path (fallback for low confidence, or known non-service contacts)
    isVerificationCode =
      verificationCode != null || isVerificationCodeRuleStatus(ruleResult.status);

    // Require auth phrasing / AUTH_LINK rule — never URL scrape alone.
    isAuthLink =
      !isVerificationCode &&
      (isAuthLinkRuleStatus(ruleResult.status) ||
        isAuthLinkEmail({
          from,
          subject: email.subject,
          text: bodyText,
          html: email.html,
        }));

    if (isAuthLink) {
      authActionUrl =
        extractAuthActionUrl({
          from,
          subject: email.subject,
          text: bodyText,
          html: email.html,
        })?.url ?? null;
    }

    if (isVerificationCode) {
      const company = await getCompanyConfig().catch(() => null);
      otpPurpose = describeOtpPurpose(
        { from, subject: email.subject, text: bodyText, html: email.html },
        company?.name,
      );
    }

    if (isAuthLink) {
      const company = await getCompanyConfig().catch(() => null);
      authLinkPurpose = describeAuthLinkPurpose(
        { from, subject: email.subject, text: bodyText, html: email.html },
        company?.name,
      );
    }

    if (isVerificationCode && verificationCode) {
      summary = otpPurpose
        ? `${otpPurpose}: ${verificationCode} — tap to copy`
        : `Code: ${verificationCode} — tap to copy`;
    } else if (isAuthLink) {
      summary = authLinkPurpose
        ? `${authLinkPurpose} — tap Activate`
        : 'Activation link — tap Activate';
    }

    // Receipt override: DELETE must not win over a completed payment receipt.
    if (
      !isVerificationCode &&
      !isAuthLink &&
      (category === 'junk' || ruleResult.status.toUpperCase() === 'DELETE')
    ) {
      const earlyReceipt = shouldAutoFileAsReceipt({
        from,
        subject: email.subject ?? '',
        summary,
        bodyText,
        bodySnippet: snippet(bodyText),
      });
      if (earlyReceipt) {
        category = 'receipt';
        action = 'receipt';
        routeNote = earlyReceipt.routeNote;
        pushAudit(
          'override',
          'Receipt override beat junk/DELETE',
          'Completed payment receipt wins over junk rule',
        );
        for (const step of earlyReceipt.audit) {
          classificationAudit.push(classificationAuditStep(step.step, step.decision, step.detail));
        }
      }
    }

    if (isVerificationCode) {
      category = 'otp';
      action = 'verification_code';
      routeNote = routeNote || 'Verification code — tap to copy; auto-deletes in 5 min';
    } else if (isAuthLink) {
      category = 'auth_link';
      action = 'activation_link';
      routeNote =
        routeNote ||
        (authActionUrl
          ? 'Activation link — tap Activate; email deletes after use'
          : 'Activation link — open Email tab; auto-deletes soon');
    } else if (category !== 'junk' && category !== 'receipt' && aiEnabled() && !agentFirst) {
      // Known professional/personal contacts: legacy AI triage (no confidence gate).
      const ai = await runAiTriage(email, jobs, contactName, receivedAt);
      if (ai) {
        category = ai.category;
        summary = ai.summary;
        if (
          attachments.length &&
          /\b(no body|blank|empty|no content|no message body|no attachment details|just (a |his )?signature)\b/i.test(
            summary,
          ) &&
          !/\battach/i.test(summary)
        ) {
          summary = attachmentSummaryFallback(attachments);
        }
        routeNote = ai.reason ?? '';
        proposedMeetingStart = ai.proposed_meeting_start;
        schedulingNote = ai.scheduling_note ?? '';
        proposedMeetingDurationMinutes = ai.proposed_meeting_duration_minutes ?? null;
        const meeting = applyMeetingProposal({
          category,
          proposedMeetingStart,
          schedulingNote,
          subject: email.subject ?? '',
          bodyText,
          receivedAt,
        });
        if (meeting.discardedReason) {
          pushAudit('meeting', 'Discarded invented meeting time', meeting.discardedReason);
        }
        proposedMeetingStart = meeting.proposedMeetingStart;
        schedulingNote = meeting.schedulingNote;
        const job = pickJobSlug(ai.job_slug, jobs, email.subject ?? '');
        if (job && category === 'client' && ai.note_to_append?.trim()) {
          if (dryRun) {
            jobSlug = job.slug;
            jobTitle = job.title;
            action = 'filed';
            routeNote = `Would append to job "${job.title}"`;
            pushAudit('job', `Would append note to "${job.title}"`, 'Dry-run — job body not modified');
          } else {
            const appended = await storeAppendWorkNote(job.slug, ai.note_to_append.trim(), {
              subject: email.subject ?? '',
              from: senderEmail,
            });
            if (appended.ok) {
              jobSlug = job.slug;
              jobTitle = job.title;
              action = 'filed';
              routeNote = `Appended to job "${job.title}"`;
            } else {
              action = 'review';
              routeNote = `Job match ${job.slug} but append failed: ${appended.error}`;
            }
          }
        } else if (job && category === 'client') {
          jobSlug = job.slug;
          jobTitle = job.title;
          action = 'matched';
          routeNote = routeNote || `Matched job "${job.title}" (no note extracted)`;
        } else if (category === 'client' && !contactUid) {
          category = 'review';
          routeNote = 'Contact-like mail but sender not in contacts';
          action = 'review';
        } else if (category === 'junk' && knownContact) {
          category = 'internal';
          action = 'classified';
          routeNote = [routeNote, 'Known contact — not junk'].filter(Boolean).join(' · ');
          pushAudit(
            'contact',
            'Known contact blocked AI junk',
            'AI triage labeled junk; remapped to internal',
          );
        } else if (category === 'junk') {
          action = 'junk';
        } else if (category === 'alert') {
          action = 'alert';
        } else if (category === 'review') {
          action = 'review';
        }
      }
    } else if (category === 'junk') {
      action = 'junk';
      summary = email.subject || 'Filtered as junk';
    } else if (category === 'receipt') {
      action = 'receipt';
    } else if (
      ruleResult.status.toUpperCase() === 'AUTO_ARCHIVED' ||
      inboxStatusOverride === 'AUTO_ARCHIVED'
    ) {
      category = 'internal';
      action = 'filed';
    } else {
      // Known contact already skipped catalog junk. Leave review/alert
      // unless a personal rule or trusted AI already classified the message.
      category = category === 'alert' ? 'alert' : 'review';
      action = category;
    }

    if (needsExplain && aiClassify) {
      routeNote = [
        routeNote,
        `Low AI confidence (${Math.round(aiClassify.confidence * 100)}% on ${aiClassify.label}; need ≥${Math.round(confidenceMin * 100)}%) — rules applied`,
      ]
        .filter(Boolean)
        .join(' · ');
    } else if (needsExplain && !aiClassify) {
      routeNote = [routeNote, 'AI classify unavailable — rules applied'].filter(Boolean).join(' · ');
    }
  }

  const suppressedAsJunk =
    !isVerificationCode &&
    !isAuthLink &&
    (category === 'junk' ||
      action === 'junk' ||
      ruleResult.status.toUpperCase() === 'DELETE' ||
      ruleResult.status.toUpperCase() === 'AUTO_ARCHIVED');
  // Operational alerts (e.g. Google "Security alert") must not become urgent client-replies
  // just because a project happens to share the subject line.
  const suppressedAsOperationalAlert = isOperationalAlertStatus(ruleResult.status);
  if (!suppressedAsJunk && !suppressedAsOperationalAlert) {
    const replyMatch = await detectProjectClientReply({
      senderEmail,
      contactUid,
      contactEmailOnRecord,
      subject: email.subject ?? '',
      headers: email.headers,
      jobs,
    });
    if (replyMatch) {
      const threadedReply = isLikelyClientThreadReply({
        subject: email.subject ?? '',
        headers: email.headers,
      });
      const looksLikeMeeting =
        Boolean(proposedMeetingStart || schedulingNote) ||
        /\b(meet(ing)?|schedule|appointment|available|availability)\b/i.test(
          `${summary} ${schedulingNote} ${snippet(bodyText, 500)}`,
        );
      const projectLabel = displayProjectTitle(replyMatch.jobTitle, contactName);
      // Meeting asks are not "client replies" — even with Re: headers or when the
      // only open job is a leftover "New Project — …" stub. Apex / forwarded
      // copies into inbound must keep the AI summary, not a reply framing.
      if (looksLikeMeeting) {
        if (!jobSlug) {
          jobSlug = replyMatch.jobSlug;
          jobTitle = replyMatch.jobTitle;
        }
        routeNote =
          routeNote ||
          `Meeting request from ${contactName ?? senderEmail} on "${projectLabel}"`;
      } else if (threadedReply) {
        isProjectReply = true;
        category = 'client';
        action = 'project_reply';
        jobSlug = replyMatch.jobSlug;
        jobTitle = replyMatch.jobTitle;
        routeNote = `🚨 Contact replied on "${projectLabel}" — follow up ASAP. ${replyMatch.reason}`;
        if (!summary.toLowerCase().includes('contact replied') && !summary.toLowerCase().includes('client replied')) {
          summary = `Contact replied on project ${projectLabel}: ${summary}`;
        }
      } else {
        // Outbound subject match without true thread headers — link quietly.
        if (!jobSlug) {
          jobSlug = replyMatch.jobSlug;
          jobTitle = replyMatch.jobTitle;
        }
        routeNote =
          routeNote ||
          `Linked to project "${projectLabel}"`;
        if (action !== 'filed' && action !== 'matched') {
          action = 'matched';
        }
        if (category !== 'junk' && category !== 'alert') {
          category = 'client';
        }
      }
    }
  }

  let inboxStatus = isProjectReply
    ? 'PROJECT_REPLY'
    : isVerificationCode
      ? 'VERIFICATION_CODE'
      : isAuthLink
        ? 'AUTH_LINK'
        : inboxStatusOverride || ruleResult.status;

  // Late receipt auto-file — skip when agent already classified (esp. failed_payment / alert).
  const skipLateReceipt =
    aiTrusted &&
    action !== 'receipt' &&
    category !== 'receipt';
  if (
    !skipLateReceipt &&
    !shouldSkipAutoReceipt({
      category,
      ruleStatus: ruleResult.status,
      isProjectReply,
    })
  ) {
    const autoReceipt = shouldAutoFileAsReceipt({
      from,
      subject: email.subject ?? '',
      summary,
      bodyText,
      bodySnippet: snippet(bodyText),
    });
    if (autoReceipt) {
      category = 'receipt';
      action = 'receipt';
      inboxStatus = 'RECEIPT';
      routeNote = autoReceipt.routeNote;
      pushAudit('late_receipt', 'Late auto-file as receipt', 'shouldAutoFileAsReceipt after rules/AI');
      for (const step of autoReceipt.audit) {
        if (!classificationAudit.some((s) => s.step === step.step && s.decision === step.decision)) {
          classificationAudit.push(classificationAuditStep(step.step, step.decision, step.detail));
        }
      }
    } else if (category === 'receipt' && action === 'receipt' && !routeNote) {
      routeNote = 'Payment notification — filed as receipt';
      pushAudit('auto_file', 'Filed as receipt', 'Payment notification — rule/AI already set receipt');
    }
  }

  if (category === 'receipt' && !classificationAudit.some((s) => s.step === 'title')) {
    const amountLabel = routeNote?.startsWith('Tax receipt')
      ? routeNote
      : 'Tax receipt (pending expense log)';
    pushAudit(
      'title',
      `Dashboard label: ${amountLabel}`,
      'Expense-side receipts use the Tax receipt banner for Crater logging — not “Payment of $… from …” income',
    );
  }

  // Ensure inboxStatus reflects receipt even when the early-override fired
  // (ruleResult.status would still be DELETE without this correction).
  if (category === 'receipt' && action === 'receipt' && inboxStatus.toUpperCase() === 'DELETE') {
    inboxStatus = 'RECEIPT';
  }

  // Income notices must never stay filed as tax/expense receipts.
  // "Payment of $… from …" is money received — the keyword is "from", not due/invoice.
  const moneyEv = {
    from,
    subject: email.subject ?? '',
    summary,
    bodyText,
    bodySnippet: snippet(bodyText),
  };
  if (
    category === 'receipt' &&
    (looksLikeIncomingPayment(moneyEv) || looksLikePaymentNotification(moneyEv))
  ) {
    category = 'internal';
    action = 'classified';
    inboxStatus = inboxStatus.toUpperCase() === 'RECEIPT' ? 'UNMATCHED' : inboxStatus;
    routeNote = 'Incoming payment (income) — not a tax/expense receipt';
    pushAudit(
      'correction',
      'Unfiled as tax receipt',
      '"Payment of $… from …" / payment-received language is money in, not an expense',
    );
  }

  if (looksLikeShipmentNotice(moneyEv) && (category === 'receipt' || inboxStatus.toUpperCase() === 'RECEIPT')) {
    category = 'internal';
    action = 'filed';
    inboxStatus = 'AUTO_ARCHIVED';
    routeNote = 'Shipment tracking — auto-archived (not a tax receipt)';
    pushAudit(
      'correction',
      'Unfiled as tax receipt',
      'Shipment tracking / shipped notices are not expense receipts',
      shipmentRuleLink,
    );
  }

  if (category === 'receipt' && looksLikeFailedOrDuePayment(moneyEv)) {
    category = 'alert';
    action = 'failed_payment';
    inboxStatus = 'FAILED_PAYMENT';
    routeNote = 'Payment due / Stripe Capital — not a tax/expense receipt';
    pushAudit(
      'correction',
      'Unfiled as tax receipt',
      'Stripe Capital / debit initiated / outstanding payment language is not an expense receipt',
    );
  }

  if (needsExplain && !noKeywordRule) {
    // Prefer review visibility over silent junk when we're unsure.
    // Always stamp needs_explain so meeting/project review banners do not
    // appear alongside the triage "Explain" alert for the same email.
    // Unmatched mail (no keyword rule) stays in the inbox — no Explain notice.
    if (category === 'junk' && action === 'junk') {
      category = 'review';
      action = 'needs_explain';
      if (inboxStatus.toUpperCase() === 'DELETE') inboxStatus = 'UNMATCHED';
    } else if (
      action !== 'verification_code' &&
      action !== 'activation_link' &&
      action !== 'project_reply'
    ) {
      if (category === 'junk') category = 'review';
      action = 'needs_explain';
      if (inboxStatus.toUpperCase() === 'DELETE') inboxStatus = 'UNMATCHED';
    }
  }

  if (
    !automationKind &&
    isSuggestedProjectMatch({ action, jobSlug, category, automationKind: null })
  ) {
    automationKind = 'project_match_suggested';
  }

  let skipAutoBook = false;

  // Uncertain classification → triage Explain only. Do not also emit meeting
  // automation / Confirm banners for the same inbound message.
  if (
    !needsExplain &&
    !suppressedAsJunk &&
    hasFeature('scheduling') &&
    action !== 'project_reply' &&
    senderEmail.includes('@')
  ) {
    const followUp = await detectMeetingFollowUp({
      from,
      contactName,
      subject: email.subject ?? '',
      summary,
      bodyText,
      proposedMeetingStart,
    });
    if (followUp) {
      skipAutoBook = true;
      automationKind = 'meeting_followup';
      bookingUid = followUp.booking.uid;
      bookingStart = followUp.booking.startTime;
      routeNote = followUp.routeNote;
      if (action !== 'filed' && action !== 'matched' && action !== 'project_reply') {
        action = 'review';
      }
      if (category !== 'junk' && category !== 'alert') {
        category = 'client';
      }
    }
  }

  if (
    !needsExplain &&
    !skipAutoBook &&
    !suppressedAsJunk &&
    proposedMeetingStart &&
    !MEETING_SKIP_CATEGORIES.has(category) &&
    hasFeature('scheduling') &&
    action !== 'project_reply'
  ) {
    if (dryRun) {
      // Same gate as production — skip contact create + calendar write.
      automationKind = 'meeting_request';
      routeNote =
        routeNote ||
        `Would attempt auto-book for ${proposedMeetingStart} (dry-run — booking skipped)`;
      if (action !== 'filed' && action !== 'matched' && action !== 'project_reply') {
        action = 'review';
      }
      if (category !== 'junk' && category !== 'alert') {
        category = 'client';
      }
      pushAudit(
        'meeting',
        'Would attempt meeting auto-book',
        `proposed ${proposedMeetingStart} · dry-run skips ensureContact + calendar write`,
      );
    } else {
      // Ensure the sender's contact first (exact-email resolve / create) so the
      // booking service receives a definite contact uid and skips its fuzzy name
      // match — otherwise a sender like "joel.martinez" can loosely match an
      // unrelated contact ("Martin …") and the auto-book silently fails.
      const contactResult = await ensureContactForMeetingEmail({
        from,
        bodyText,
        summary,
        existingContactUid: contactUid,
        existingContactName: contactName,
      });
      const confirmContactUid = contactResult?.ok ? contactResult.uid : undefined;

      const autoBook = await tryAutoBookInboundMeeting({
        proposedStart: proposedMeetingStart,
        from,
        contactName,
        subject: email.subject ?? '',
        schedulingNote,
        summary,
        bodyText,
        durationMinutes: proposedMeetingDurationMinutes,
        confirmContactUid,
      });
      if (autoBook.ok) {
        action = 'booked';
        bookingUid = autoBook.bookingUid;
        bookingStart = autoBook.bookingStart;
        routeNote = autoBook.routeNote;
        automationKind = 'meeting_booked';

        if (contactResult?.ok) {
          contactUid = contactResult.uid;
          contactName = contactResult.name;
          if (contactResult.created) {
            const companyBit = contactResult.company ? ` (${contactResult.company})` : '';
            routeNote = `${routeNote} · Added ${contactResult.name}${companyBit} to contacts`;
          }
        } else if (contactResult && !contactResult.ok) {
          console.warn('[email] auto-book contact ensure failed', contactResult.error);
        }

        if (summary && !summary.toLowerCase().includes('scheduled automatically')) {
          summary = `${summary} Meeting scheduled automatically for ${autoBook.whenLabel}.`;
        }
      } else if (proposedMeetingStart) {
        automationKind = autoBook.reason === 'unavailable' ? 'meeting_conflict' : 'meeting_request';
        routeNote =
          autoBook.error ||
          (autoBook.reason === 'unavailable'
            ? 'Requested meeting time conflicts with an existing booking'
            : 'Meeting request needs your review');
        if (action !== 'filed' && action !== 'matched' && action !== 'project_reply') {
          action = 'review';
        }
        if (category !== 'junk' && category !== 'alert') {
          category = 'client';
        }
      }
    }
  } else if (
    !needsExplain &&
    !skipAutoBook &&
    !suppressedAsJunk &&
    proposedMeetingStart &&
    !MEETING_SKIP_CATEGORIES.has(category) &&
    !hasFeature('scheduling') &&
    action !== 'project_reply'
  ) {
    automationKind = 'meeting_request';
    routeNote = routeNote || 'Meeting request needs your review (scheduling module off)';
    if (action !== 'filed' && action !== 'matched') action = 'review';
  }

  let suppressDuplicateMeetingAlert = false;
  if (
    automationKind === 'meeting_request' ||
    automationKind === 'meeting_conflict'
  ) {
    const threadPrior = await findPriorInboxInThread({
      headers: email.headers,
      subject: email.subject ?? '',
      from,
    });
    if (
      shouldSuppressDuplicateMeetingAlert({
        automationKind,
        prior: threadPrior,
        proposedMeetingStart,
      })
    ) {
      suppressDuplicateMeetingAlert = true;
      routeNote = routeNote
        ? `${routeNote} · Thread reply — meeting request already pending`
        : 'Thread reply — meeting request already pending on earlier message in this thread';
    }
  }

  const deleteAfterAt =
    isVerificationCode || isAuthLink ? await verificationCodeDeleteAfterAt() : null;

  // Hard rule: if we will fire a dashboard/push notification, the stored message is not junk.
  const agentWillAlertPreview =
    !noKeywordRule &&
    shouldAgentAlertForInboundEmail({
      category,
      status: ruleResult.status,
      isUptimeRobot: isUptimeRobotEmail(email),
    });
  const willNotifyPreview =
    !isJunkClassification({ category, action, status: inboxStatus }) &&
    (isProjectReply ||
      Boolean(verificationCode) ||
      isVerificationCode ||
      isAuthLink ||
      (needsExplain && !noKeywordRule) ||
      agentWillAlertPreview ||
      Boolean(automationKind) ||
      shouldSendInboxPush({
        category,
        action,
        ruleNotify: ruleResult.notify || (needsExplain && !noKeywordRule),
        ruleStatus: inboxStatus,
        isProjectReply,
        automationKind,
      }));
  if (willNotifyPreview) {
    const fixed = enforceNotificationNotJunk({
      category,
      action,
      status: inboxStatus,
      willNotify: true,
      isProjectReply,
    });
    category = fixed.category as EmailCategory;
    action = fixed.action;
    inboxStatus = fixed.status;
  }

  let inboxRecord: EmailInboxRecord | null = null;

  // No keyword rule → inbox only. Notices / agent chats are reserved for a
  // matched rule (or OTP / auth / meeting / project automations).
  if (noKeywordRule) {
    const agentHay = `${routeNote} ${summary}`;
    pushAudit(
      'persist',
      'No keyword rule — filed in inbox',
      'No notice or agent chat. Teach/correct from the dashboard if this should become a permanent rule',
      /shipment|shipping notice|auto-archiv/i.test(agentHay) ? shipmentRuleLink : undefined,
    );
  }

  if (dryRun) {
    if (suppressDuplicateMeetingAlert) {
      automationKind = null;
      pushAudit('dedupe', 'Would suppress duplicate meeting alert', routeNote);
    }
    pushAudit('persist', 'Would write inbox row', `${inboxStatus} · ${category} · ${action}`);
  } else {
    const persistFields = {
      from,
      subject: email.subject ?? '',
      bodySnippet: snippet(bodyText) || attachmentSummaryFallback(attachments),
      bodyText,
      bodyHtml,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      headers: email.headers,
      messageId: email.messageId,
      resendEmailId: email.resendEmailId,
      attachments,
      status: inboxStatus,
      action,
      notified: false,
      summary,
      category,
      contactUid,
      contactName,
      jobSlug,
      jobTitle,
      routeNote,
      classificationAudit,
      proposedMeetingStart,
      schedulingNote,
      bookingUid,
      bookingStart,
      automationKind,
      verificationCode,
      actionUrl: isAuthLink ? authActionUrl : null,
      deleteAfterAt,
    };
    const record = options?.existingInboxId
      ? await storeUpdateEmailInbox(options.existingInboxId, persistFields).catch((e) => {
          console.warn('[email] inbox update failed', e);
          return null;
        })
      : await storeRecordEmailInbox({ ...persistFields, receivedAt }).catch((e) => {
          console.warn('[email] inbox log failed', e);
          return null;
        });

    inboxRecord = record;

    // Delete/junk is a guaranteed no-notification: drop leftover alerts if this
    // row was re-triaged (sleep catch-up / existingInboxId) after an earlier ping.
    if (inboxRecord?.id && isJunkClassification({ category, action, status: inboxStatus })) {
      await dismissEmailRelatedNotifications(inboxRecord.id, { markAutomationAck: false }).catch(
        () => undefined,
      );
    }

    if (inboxRecord?.id && suppressDuplicateMeetingAlert) {
      const updated = await storeUpdateEmailInbox(inboxRecord.id, {
        acceptAutomationDecision: true,
        markAutomationAck: true,
        automationKind: null,
        routeNote,
      });
      if (updated) inboxRecord = updated;
      automationKind = null;
    }

    if (inboxRecord?.id && bookingUid && !jobSlug && ruleAllowsAutoProject(ruleResult.matched)) {
      const meetingProject = await ensureProjectForMeetingEmail({
        emailId: inboxRecord.id,
        from,
        subject: email.subject ?? '',
        summary,
        bodyText,
        bodySnippet: snippet(bodyText),
        receivedAt: inboxRecord.receivedAt,
        contactUid,
        contactName,
        resendEmailId: email.resendEmailId,
        jobSlug,
        bookingUid,
        bookingStart,
      });
      if (meetingProject.ok) {
        jobSlug = meetingProject.slug;
        jobTitle = meetingProject.title;
        contactUid = meetingProject.contactUid;
        contactName = meetingProject.contactName;
        const updated = await storeUpdateEmailInbox(inboxRecord.id, {
          jobSlug,
          jobTitle,
          contactUid,
          contactName,
        });
        if (updated) inboxRecord = updated;
      } else {
        console.warn('[email] meeting project attach failed', meetingProject.error);
      }
    }

    if (inboxRecord?.id && jobSlug) {
      linkProjectItem(jobSlug, 'email', inboxRecord.id).catch((e) =>
        console.warn('[email] project link failed', e),
      );

      const deferAttachments = automationKind === 'project_match_suggested';
      if (email.resendEmailId && !deferAttachments) {
        void importEmailAttachmentsToProject({
          emailId: inboxRecord.id,
          resendEmailId: email.resendEmailId,
          jobSlug,
        })
          .then(async (importedAtts) => {
            if (!importedAtts.imported.length && !importedAtts.errors.length) return;
            if (importedAtts.imported.length) {
              const names = importedAtts.imported.map((f) => f.filename).join(', ');
              const note = `${importedAtts.imported.length} file(s) imported from email: ${names}`;
              if (isProjectReply) {
                await storeUpdateEmailInbox(inboxRecord!.id, {
                  routeNote: `${routeNote} · ${note}`,
                }).catch(() => undefined);
              }
            }
            if (importedAtts.errors.length) {
              console.warn('[email] attachment import errors', {
                jobSlug,
                emailId: inboxRecord!.id,
                errors: importedAtts.errors,
              });
            }
          })
          .catch((e) => console.warn('[email] attachment import failed', e));
      }
    }
  }

  const paymentNotification = looksLikePaymentNotification({
    from,
    subject: email.subject ?? '',
    summary,
    bodyText,
    bodySnippet: snippet(bodyText),
  });

  const forwardedWithoutProject = !ruleAllowsAutoProject(ruleResult.matched);
  const blockAutoProject =
    forwardedWithoutProject ||
    needsExplain ||
    action === 'project_reply' ||
    action === 'junk' ||
    action === 'receipt' ||
    action === 'failed_payment' ||
    action === 'google_alert' ||
    action === 'needs_explain' ||
    category === 'junk' ||
    category === 'receipt' ||
    category === 'alert' ||
    category === 'otp' ||
    category === 'auth_link' ||
    paymentNotification ||
    (aiTrusted && aiClassify != null && aiClassify.label !== 'project' && aiClassify.label !== 'client');

  if (dryRun) {
    if (forwardedWithoutProject) {
      pushAudit(
        'project',
        'Skip auto-create project',
        `Rule forwards to ${forwardTo} — createProject is off by default`,
      );
    } else if (!automationKind && !jobSlug && !blockAutoProject) {
      pushAudit(
        'project',
        'Would evaluate auto-create project',
        'Dry-run — project create + ack email skipped',
      );
    }
  } else if (inboxRecord?.id && !automationKind && !jobSlug && !blockAutoProject) {
    const autoProject = await tryAutoCreateProjectFromInboundEmail({
      from,
      subject: email.subject ?? '',
      summary,
      bodyText,
      bodySnippet: snippet(bodyText),
      receivedAt: inboxRecord.receivedAt,
      contactUid,
      contactName,
      emailId: inboxRecord.id,
      resendEmailId: email.resendEmailId,
    });
    if (autoProject.ok) {
      jobSlug = autoProject.slug;
      jobTitle = autoProject.title;
      contactUid = autoProject.contactUid;
      contactName = autoProject.contactName;
      action = 'matched';
      category = 'project';
      automationKind = 'project_created';
      routeNote = autoProject.routeNote;
      const updated = await storeUpdateEmailInbox(inboxRecord.id, {
        action,
        category: 'project',
        status: 'MATCHED',
        jobSlug,
        jobTitle,
        contactUid,
        contactName,
        routeNote,
        automationKind,
      });
      if (updated) inboxRecord = updated;
      linkProjectItem(jobSlug, 'email', inboxRecord.id).catch((e) =>
        console.warn('[email] project link failed', e),
      );

      void sendAutoProjectAckEmail({
        inboxRecord,
        jobSlug,
        jobTitle,
        contactName,
        summary,
        subject: email.subject ?? '',
        from,
      });
    } else if (autoProject.reason !== 'not_applicable') {
      console.warn('[email] auto project create failed', autoProject.error);
    }
  }

  const matchedRule = ruleResult.matched as EmailRuleRecord | null;
  const junkSilent = isJunkClassification({ category, action, status: inboxStatus });
  const explainNotify = !junkSilent && needsExplain && !noKeywordRule;
  const channels = resolveRuleNotifyChannels(
    matchedRule,
    !junkSilent && (ruleResult.notify || explainNotify),
  );
  // OTP / auth / explain still want an alert path unless the matched rule
  // explicitly turns both channels off — never when the row is junk/DELETE.
  const forceKindNotify =
    !junkSilent &&
    (Boolean(verificationCode) || isVerificationCode || isAuthLink || explainNotify);
  const channelsEffective = junkSilent
    ? { push: false, dashboard: false, notify: false }
    : forceKindNotify
      ? {
          push: matchedRule ? channels.push : true,
          dashboard: matchedRule ? channels.dashboard : true,
          notify: matchedRule ? channels.notify : true,
        }
      : channels;
  let notifyActions = resolveRuleNotifyActions(matchedRule);
  if (!matchedRule) {
    if (isVerificationCode || verificationCode) notifyActions = ['copy', 'delete'];
    else if (isAuthLink) notifyActions = ['activate', 'delete'];
    else if (explainNotify) notifyActions = ['explain', 'view', 'archive'];
  }

  const notify = shouldSendInboxPush({
    category,
    action,
    ruleNotify: channelsEffective.notify || explainNotify,
    ruleStatus: inboxStatus,
    isProjectReply,
    automationKind,
  });

  const agentWillAlert =
    !noKeywordRule &&
    shouldAgentAlertForInboundEmail({
      category,
      status: ruleResult.status,
      isUptimeRobot: isUptimeRobotEmail(email),
    });

  const wouldNotify =
    (notify && channelsEffective.notify) ||
    ((Boolean(verificationCode) || isAuthLink || explainNotify) && channelsEffective.notify);

  if (dryRun) {
    const channelLabel = [
      channelsEffective.push ? 'push' : null,
      channelsEffective.dashboard ? 'dashboard' : null,
    ]
      .filter(Boolean)
      .join('+') || 'none';
    if ((verificationCode || isVerificationCode) && channelsEffective.notify) {
      pushAudit('push', `Would send OTP (${channelLabel})`, otpPurpose || 'Verification code');
    } else if (isAuthLink && channelsEffective.notify) {
      pushAudit('push', `Would send auth-link (${channelLabel})`, authLinkPurpose || 'Activation link');
    } else if (explainNotify && channelsEffective.notify) {
      pushAudit('push', `Would send uncertain-email triage (${channelLabel})`);
    } else if (notify && channelsEffective.notify && !agentWillAlert) {
      pushAudit('push', `Would send inbox alert (${channelLabel})`, summary.slice(0, 120));
    } else if (!wouldNotify) {
      pushAudit('push', 'No push notification', 'Silent / junk / filed without notify');
    }
    if (notifyActions.length) {
      pushAudit('push', `Actions: ${notifyActions.join(', ')}`);
    }
    if (automationKind) {
      pushAudit('agent', `Would alert agent for automation: ${automationKind}`);
    } else if (isProjectReply) {
      pushAudit('agent', 'Would alert agent for project reply');
    } else if (agentWillAlert) {
      pushAudit('agent', `Would alert agent for ${ruleResult.status}`);
    }
  } else {
    if (inboxRecord && wouldNotify && !inboxRecord.notified) {
      await storeUpdateEmailInbox(inboxRecord.id, { notified: true }).catch(() => {});
    }

    const deliver = (opts: {
      title: string;
      body: string;
      tag: string;
      kind?: 'otp' | 'auth_link' | 'triage' | 'email';
      verificationCode?: string;
      urgent?: boolean;
      skipDashboardAlert?: boolean;
    }) => {
      if (!channelsEffective.notify || !inboxRecord) return;
      sendInboxPushNotification({
        title: opts.title,
        body: opts.body,
        tag: opts.tag,
        emailId: inboxRecord.id,
        verificationCode: opts.verificationCode,
        kind: opts.kind,
        urgent: opts.urgent,
        skipDashboardAlert: opts.skipDashboardAlert || !channelsEffective.dashboard,
        skipPhonePush: !channelsEffective.push,
        actions: notifyActions,
      }).catch((e) => console.warn('[email] push failed', e));
    };

    if (inboxRecord && (verificationCode || isVerificationCode) && channelsEffective.notify) {
      const otpPush = formatOtpPushNotification({
        code: verificationCode,
        purpose: otpPurpose ?? 'Verification code',
      });
      deliver({
        title: otpPush.title,
        body: otpPush.body,
        tag: `otp-${inboxRecord.id}`,
        kind: 'otp',
        verificationCode: verificationCode || undefined,
        urgent: true,
      });
    } else if (inboxRecord && isAuthLink && channelsEffective.notify) {
      const authPush = formatAuthLinkPushNotification({
        purpose: authLinkPurpose ?? 'Activation link',
        hasUrl: Boolean(authActionUrl),
      });
      deliver({
        title: authPush.title,
        body: authPush.body,
        tag: `auth-${inboxRecord.id}`,
        kind: 'auth_link',
        urgent: true,
      });
    } else if (inboxRecord && explainNotify && channelsEffective.notify) {
      const guess = aiClassify
        ? `${aiClassify.label} at ${Math.round(aiClassify.confidence * 100)}%`
        : 'rules fallback';
      deliver({
        title: 'Uncertain email — ask agent',
        body: `${(email.subject || summary || 'Inbound mail').slice(0, 120)} · ${guess}. Tap Explain.`,
        tag: `triage-${inboxRecord.id}`,
        kind: 'triage',
      });
    } else if (inboxRecord && notify && channelsEffective.notify && !agentWillAlert) {
      const attachmentCount = attachments.length;
      const projectMatchCopy =
        automationKind === 'project_match_suggested'
          ? projectMatchSuggestedReviewCopy({
              jobTitle: jobTitle || 'a project',
              attachmentCount,
            })
          : null;
      const pushTitle = isProjectReply
        ? `🚨 Contact reply: ${contactName ?? senderEmail}`
        : projectMatchCopy
          ? projectMatchCopy.title
          : automationKind === 'project_created'
          ? `New project: ${contactName ?? jobTitle ?? senderEmail}`
          : automationKind === 'meeting_followup'
            ? 'Meeting follow-up'
            : automationKind === 'meeting_conflict'
              ? 'Meeting time conflict'
              : automationKind === 'meeting_request'
                ? 'Meeting request'
                : automationKind === 'meeting_booked'
            ? 'Meeting scheduled automatically'
            : isRailwayAlertStatus(ruleResult.status)
              ? `Railway: ${email.subject?.slice(0, 50) || 'deploy alert'}`
              : category === 'client'
                ? `Contact: ${contactName ?? senderEmail}`
                : email.subject?.trim() || contactName || senderEmail || 'New email';
      const pushBody = isProjectReply
        ? `${jobTitle ? `${jobTitle} — ` : ''}${summary}`.slice(0, 240)
        : projectMatchCopy
          ? projectMatchCopy.detail.slice(0, 240)
          : automationKind === 'project_created'
          ? `${contactName ?? senderEmail} emailed requesting work. Review the new project.`.slice(0, 240)
          : automationKind === 'meeting_followup'
            ? summary.slice(0, 240)
            : summary;
      // Meeting/project automations already render typed review banners from the
      // inbox row — phone push only, so the dashboard does not show two cards.
      const hasTypedReviewBanner =
        automationKind === 'meeting_booked' ||
        automationKind === 'meeting_request' ||
        automationKind === 'meeting_conflict' ||
        automationKind === 'meeting_followup' ||
        automationKind === 'project_created' ||
        automationKind === 'project_match_suggested';
      deliver({
        title: pushTitle,
        body: pushBody,
        tag: inboxRecord.id,
        urgent: isProjectReply,
        skipDashboardAlert: hasTypedReviewBanner,
      });
    }

    if (inboxRecord && automationKind) {
      const whenLabel =
        bookingStart || proposedMeetingStart
          ? formatMeetingWhenLabel(bookingStart || proposedMeetingStart!)
          : schedulingNote || null;
      notifyAdminAgentOfEmailAutomation({
        automationKind,
        contactName,
        jobTitle,
        jobSlug,
        whenLabel,
        summary,
        subject: email.subject ?? '',
        from,
        emailId: inboxRecord.id,
      }).catch((e) => console.warn('[email] automation alert failed', e));
    }

    if (inboxRecord && isProjectReply) {
      notifyAdminAgentOfProjectReply({
        contactName: contactName ?? senderEmail,
        jobTitle: jobTitle ?? 'project',
        summary,
        emailId: inboxRecord.id,
      }).catch((e) => console.warn('[email] project reply agent alert failed', e));
    } else if (agentWillAlert) {
      notifyAdminAgentOfEmailAlert({
        status: ruleResult.status,
        from,
        subject: email.subject ?? '',
        summary,
        category,
        emailId: inboxRecord?.id,
      }).catch((e) => console.warn('[email] agent alert failed', e));
    }
  }

  return {
    ok: true,
    category,
    status: inboxStatus,
    action,
    from,
    record: inboxRecord,
    dryRun: dryRun || undefined,
    classificationAudit,
    ruleEvaluations: ruleWalk.evaluations,
    summary,
    routeNote,
    contactUid,
    contactName,
    clientKind,
    jobSlug,
    jobTitle,
    automationKind,
    verificationCode,
    actionUrl: isAuthLink ? authActionUrl : null,
    needsExplain,
    wouldNotify,
    wouldAgentAlert: Boolean(automationKind) || isProjectReply || agentWillAlert,
    wouldForwardTo: forwardTo,
    aiClassify,
    proposedMeetingStart,
    deleteAfterAt,
  };
}
