/**
 * Inbound email intelligence: summarize, classify junk, route client mail to jobs.
 */

import { serverEnv } from './serverEnv';
import { parseSenderEmail } from './emailAddress';
import { classifyEmail, isUptimeRobotEmail, type InboundEmail } from './emailRules';
import { loadActiveEmailRules } from './emailRuleStore';
import { ensureContactForMeetingEmail } from './emailContactExtract';
import { tryAutoCreateProjectFromInboundEmail } from './emailProjectAuto';
import { importEmailAttachmentsToProject } from './emailProjectAttachments';
import { ensureProjectForMeetingEmail } from './emailMeetingProject';
import { resolveContact } from './contactApi';
import { storeListWork, storeAppendWorkNote } from './workStore';
import type { WorkJobSummary } from './workStore';
import { storeRecordEmailInbox, storeUpdateEmailInbox, type EmailInboxRecord } from './emailInboxStore';
import { linkProjectItem } from './projectLinks';
import { hasFeature } from './features';
import { detectMeetingFollowUp } from './emailMeetingFollowup';
import { attendeeFromEmail, buildNewProjectAckEmail, formatMeetingWhenLabel, parseProposedMeetingStart, resolveProposedMeetingStart, tryAutoBookInboundMeeting } from './emailScheduling';
import { sendInboxPushNotification } from './webPush';
import { notifyAdminAgentOfEmailAlert, notifyAdminAgentOfEmailAutomation, notifyAdminAgentOfProjectReply, isRailwayAlertStatus } from './adminAgentAlert';
import { getCompanyConfig } from './companyConfig';
import { sendInboundThreadReply, scheduleFormUrl } from './inboundEmailReply';
import { siteBaseUrl } from './contactApi';
import { inboxPreviewSnippet, normalizeEmailBody } from './emailBody';
import { detectProjectClientReply } from './emailProjectReply';
import { looksLikePaymentNotification, shouldAutoFileAsReceipt } from './emailMoney';
import { findPriorInboxInThread, shouldSuppressDuplicateMeetingAlert } from './emailThreadDedup';

export type EmailCategory = 'junk' | 'client' | 'alert' | 'internal' | 'review' | 'receipt' | 'project';

export interface ProcessedEmailResult {
  ok: boolean;
  category: EmailCategory;
  status: string;
  action: string;
  from: string;
  record: EmailInboxRecord | null;
}

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
  if (s === 'AUTO_ARCHIVED') return 'junk';
  if (s === 'RECEIPT') return 'receipt';
  if (s.startsWith('RAILWAY') || s === 'DOWN' || s === 'NEEDS_CHECK') return 'alert';
  return 'review';
}

type AiTriage = {
  category: EmailCategory;
  summary: string;
  job_slug: string | null;
  note_to_append: string | null;
  reason: string;
  proposed_meeting_start: string | null;
  scheduling_note: string | null;
};

async function runAiTriage(
  email: InboundEmail,
  jobs: WorkJobSummary[],
  contactName: string | null,
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
  "scheduling_note": "short human phrase for the proposed meeting time, or null when not scheduling"
}
Categories:
- junk: marketing, newsletters, spam, bulk list mail (not tax receipts — those may be filed separately)
- client: client project updates, requests, files, approvals
- alert: uptime, security, monitoring, auth warnings
- internal: personal/admin not tied to a client job
- review: ambiguous — needs human decision
Pick job_slug only when confident; prefer active/inquiry jobs.
For proposed_meeting_start: require BOTH a specific date and time. Use the Received timestamp to resolve relative phrases. "Next week Tuesday" means Tuesday of the following calendar week, not the nearest Tuesday. "Next Tuesday" skips the imminent Tuesday (e.g. on Monday, next Tuesday is 8 days out). Vague availability ("let's find a time") with no day/time must be null. Deadlines and launch dates are NOT meetings.`;

  const triageBody = normalizeEmailBody(email.text, email.html);
  const receivedAt = new Date().toISOString();
  const user = [
    `Received: ${receivedAt}`,
    `From: ${email.from ?? ''}`,
    `Subject: ${email.subject ?? ''}`,
    contactName ? `Known contact: ${contactName}` : '',
    `Open jobs for this sender:\n${jobLines}`,
    '',
    'Body:',
    triageBody.slice(0, 4000),
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
    return parsed;
  } catch (e) {
    console.warn('[email] AI triage failed', e);
    return null;
  }
}

function extractContact(data: unknown): { uid: string; name: string } | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as { match?: string; contact?: { uid?: string; name?: string } };
  if ((o.match === 'exact' || o.match === 'likely') && o.contact?.uid) {
    return {
      uid: String(o.contact.uid),
      name: String(o.contact.name ?? '').trim() || 'Client',
    };
  }
  return null;
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
  const active = jobs.filter((j) => j.status === 'active' || j.status === 'inquiry');
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
  if (opts.isProjectReply) return true;
  if (opts.automationKind === 'meeting_booked' || opts.automationKind === 'project_created' || opts.automationKind === 'meeting_followup' || opts.automationKind === 'meeting_request' || opts.automationKind === 'meeting_conflict') return true;

  const action = opts.action.toLowerCase();
  const status = opts.ruleStatus.toUpperCase();

  if (opts.category === 'junk' || action === 'junk') return false;
  if (opts.category === 'receipt') return false;
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
    const scheduleUrl = hasFeature('scheduling') ? scheduleFormUrl(siteBaseUrl()) : null;
    const mail = await buildNewProjectAckEmail({
      attendeeName: attendee.name,
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

export async function processInboundEmail(email: InboundEmail): Promise<ProcessedEmailResult> {
  const from = email.from ?? '';
  const senderEmail = parseSenderEmail(from);
  const bodyText = normalizeEmailBody(email.text, email.html);

  const { rules, notifyOnUnmatched } = await loadActiveEmailRules();
  const ruleResult = classifyEmail(email, rules, notifyOnUnmatched);
  let category: EmailCategory = ruleCategory(ruleResult.status);
  let summary = snippet(bodyText) || email.subject || '(no subject)';
  let jobSlug: string | null = null;
  let jobTitle: string | null = null;
  let contactUid: string | null = null;
  let contactName: string | null = null;
  let routeNote = '';
  let action = 'classified';
  let proposedMeetingStart: string | null = null;
  let schedulingNote = '';
  let bookingUid: string | null = null;
  let bookingStart: string | null = null;
  let automationKind: string | null = null;
  const receivedAt = new Date().toISOString();

  const contactRes = senderEmail.includes('@')
    ? await resolveContact({ email: senderEmail })
    : null;
  const contact = contactRes?.ok ? extractContact(contactRes.data) : null;
  const contactEmailOnRecord = contactRes?.ok
    ? ((contactRes.data as { contact?: { email?: string | null } }).contact?.email ?? null)
    : null;
  if (contact) {
    contactUid = contact.uid;
    contactName = contact.name;
  }

  const jobs =
    contactUid != null
      ? (await storeListWork({ contact_uid: contactUid })).filter(
          (j) => j.status !== 'done' && j.status !== 'archived',
        )
      : [];

  let isProjectReply = false;

  if (category !== 'junk' && category !== 'receipt' && aiEnabled()) {
    const ai = await runAiTriage(email, jobs, contactName);
    if (ai) {
      category = ai.category;
      summary = ai.summary;
      routeNote = ai.reason ?? '';
      proposedMeetingStart = ai.proposed_meeting_start;
      schedulingNote = ai.scheduling_note ?? '';
      const bodySnippet = snippet(bodyText, 2000);
      const schedulingContext = `${schedulingNote} ${summary} ${bodySnippet}`;
      const mentionsNextWeek = /\bnext\s+week\b/i.test(schedulingContext);
      const mentionsScheduling =
        schedulingNote ||
        mentionsNextWeek ||
        /\b(meet|meeting|schedule|appointment|get together)\b/i.test(summary);
      if (!proposedMeetingStart || mentionsNextWeek) {
        if (mentionsScheduling) {
          const resolved = resolveProposedMeetingStart({
            proposedMeetingStart: mentionsNextWeek ? null : proposedMeetingStart,
            schedulingNote,
            summary,
            bodyText: bodySnippet,
            receivedAt,
          });
          if (resolved) proposedMeetingStart = resolved;
        }
      }
      const job = pickJobSlug(ai.job_slug, jobs, email.subject ?? '');
      if (job && category === 'client' && ai.note_to_append?.trim()) {
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
      } else if (job && category === 'client') {
        jobSlug = job.slug;
        jobTitle = job.title;
        action = 'matched';
        routeNote = routeNote || `Matched job "${job.title}" (no note extracted)`;
      } else if (category === 'client' && !contact) {
        category = 'review';
        routeNote = 'Client-like mail but sender not in contacts';
        action = 'review';
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
  } else if (contact && jobs.length === 1) {
    category = 'client';
    action = 'review';
    jobSlug = jobs[0]!.slug;
    jobTitle = jobs[0]!.title;
    routeNote = `From known client; single open job "${jobTitle}"`;
  } else if (contact) {
    category = 'client';
    action = 'review';
    routeNote = `From known client ${contactName}`;
  } else {
    category = category === 'alert' ? 'alert' : 'review';
    action = category;
  }

  const suppressedAsJunk =
    category === 'junk' || action === 'junk' || ruleResult.status.toUpperCase() === 'DELETE';
  if (!suppressedAsJunk) {
    const replyMatch = await detectProjectClientReply({
      senderEmail,
      contactUid,
      contactEmailOnRecord,
      subject: email.subject ?? '',
      headers: email.headers,
      jobs,
    });
    if (replyMatch) {
      isProjectReply = true;
      category = 'client';
      action = 'project_reply';
      jobSlug = replyMatch.jobSlug;
      jobTitle = replyMatch.jobTitle;
      routeNote = `🚨 Client replied on "${replyMatch.jobTitle}" — follow up ASAP. ${replyMatch.reason}`;
      if (!summary.toLowerCase().includes('client replied')) {
        summary = `Client replied on project ${replyMatch.jobTitle}: ${summary}`;
      }
    }
  }

  let inboxStatus = isProjectReply ? 'PROJECT_REPLY' : ruleResult.status;
  if (!isProjectReply && category !== 'junk') {
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
    } else if (category === 'receipt' && action === 'receipt' && !routeNote) {
      routeNote = 'Payment notification — filed as receipt';
    }
  }

  let skipAutoBook = false;

  if (!suppressedAsJunk && hasFeature('scheduling') && action !== 'project_reply' && senderEmail.includes('@')) {
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
    !skipAutoBook &&
    !suppressedAsJunk &&
    proposedMeetingStart &&
    hasFeature('scheduling') &&
    action !== 'project_reply'
  ) {
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
          routeNote = `${routeNote} · Added ${contactResult.name}${companyBit} to clients`;
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
  } else if (
    !skipAutoBook &&
    !suppressedAsJunk &&
    proposedMeetingStart &&
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

  const record = await storeRecordEmailInbox({
    from,
    subject: email.subject ?? '',
    bodySnippet: snippet(bodyText),
    bodyText,
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    replyTo: email.replyTo,
    headers: email.headers,
    messageId: email.messageId,
    resendEmailId: email.resendEmailId,
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
    proposedMeetingStart,
    schedulingNote,
    bookingUid,
    bookingStart,
    automationKind,
  }).catch((e) => {
    console.warn('[email] inbox log failed', e);
    return null;
  });

  let inboxRecord = record;

  if (inboxRecord?.id && suppressDuplicateMeetingAlert) {
    const updated = await storeUpdateEmailInbox(inboxRecord.id, {
      markAutomationAck: true,
      automationKind: null,
      routeNote,
    });
    if (updated) inboxRecord = updated;
    automationKind = null;
  }

  if (inboxRecord?.id && bookingUid && !jobSlug) {
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

    if (email.resendEmailId) {
      void importEmailAttachmentsToProject({
        emailId: inboxRecord.id,
        resendEmailId: email.resendEmailId,
        jobSlug,
      })
        .then(async (attachments) => {
          if (!attachments.imported.length && !attachments.errors.length) return;
          if (attachments.imported.length) {
            const names = attachments.imported.map((f) => f.filename).join(', ');
            const note = `${attachments.imported.length} file(s) imported from email: ${names}`;
            if (isProjectReply) {
              await storeUpdateEmailInbox(inboxRecord!.id, {
                routeNote: `${routeNote} · ${note}`,
              }).catch(() => undefined);
            }
          }
          if (attachments.errors.length) {
            console.warn('[email] attachment import errors', {
              jobSlug,
              emailId: inboxRecord!.id,
              errors: attachments.errors,
            });
          }
        })
        .catch((e) => console.warn('[email] attachment import failed', e));
    }
  }

  const paymentNotification = looksLikePaymentNotification({
    from,
    subject: email.subject ?? '',
    summary,
    bodyText,
    bodySnippet: snippet(bodyText),
  });

  if (
    inboxRecord?.id &&
    !automationKind &&
    !jobSlug &&
    action !== 'project_reply' &&
    action !== 'junk' &&
    action !== 'receipt' &&
    category !== 'junk' &&
    category !== 'receipt' &&
    !paymentNotification
  ) {
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

  const notify = shouldSendInboxPush({
    category,
    action,
    ruleNotify: ruleResult.notify,
    ruleStatus: ruleResult.status,
    isProjectReply,
    automationKind,
  });

  if (inboxRecord && notify && !inboxRecord.notified) {
    await storeUpdateEmailInbox(inboxRecord.id, { notified: true }).catch(() => {});
  }

  if (inboxRecord && notify) {
    const pushTitle = isProjectReply
      ? `🚨 Client reply: ${contactName ?? senderEmail}`
      : automationKind === 'project_created'
        ? `New project: ${jobTitle ?? 'from email'}`
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
              ? `Client: ${contactName ?? senderEmail}`
              : summary.slice(0, 60);
    const pushBody = isProjectReply
      ? `${jobTitle ? `${jobTitle} — ` : ''}${summary}`.slice(0, 240)
      : automationKind === 'project_created'
        ? `${contactName ?? senderEmail} emailed requesting work. Review the new project.`.slice(0, 240)
        : automationKind === 'meeting_followup'
          ? summary.slice(0, 240)
          : summary;
    sendInboxPushNotification({
      title: pushTitle,
      body: pushBody,
      tag: inboxRecord.id,
      emailId: inboxRecord.id,
    }).catch((e) => console.warn('[email] push failed', e));
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
  } else if (
    (category === 'alert' || isRailwayAlertStatus(ruleResult.status)) &&
    !(hasFeature('uptime_monitoring') && isUptimeRobotEmail(email))
  ) {
    notifyAdminAgentOfEmailAlert({
      status: ruleResult.status,
      from,
      subject: email.subject ?? '',
      summary,
      category,
      emailId: inboxRecord?.id,
    }).catch((e) => console.warn('[email] agent alert failed', e));
  }

  return { ok: true, category, status: inboxStatus, action, from, record: inboxRecord };
}
