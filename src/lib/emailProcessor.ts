/**
 * Inbound email intelligence: summarize, classify junk, route client mail to jobs.
 */

import { serverEnv } from './serverEnv';
import { parseSenderEmail } from './emailAddress';
import { classifyEmail, type InboundEmail } from './emailRules';
import { loadActiveEmailRules } from './emailRuleStore';
import { resolveContact } from './contactApi';
import { storeListWork, storeAppendWorkNote } from './workStore';
import type { WorkJobSummary } from './workStore';
import { storeRecordEmailInbox, type EmailInboxRecord } from './emailInboxStore';
import { linkProjectItem } from './projectLinks';
import { parseProposedMeetingStart } from './emailScheduling';
import { sendInboxPushNotification } from './webPush';
import { notifyAdminAgentOfEmailAlert, isRailwayAlertStatus } from './adminAgentAlert';

export type EmailCategory = 'junk' | 'client' | 'alert' | 'internal' | 'review';

export interface ProcessedEmailResult {
  ok: boolean;
  category: EmailCategory;
  status: string;
  action: string;
  from: string;
  record: EmailInboxRecord | null;
}

function snippet(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function aiEnabled(): boolean {
  if (serverEnv('EMAIL_AI_ENABLED') === '0') return false;
  return Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim());
}

function ruleCategory(status: string): EmailCategory {
  const s = status.toUpperCase();
  if (s === 'DELETE') return 'junk';
  if (s === 'AUTO_ARCHIVED') return 'junk';
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
  "proposed_meeting_start": "ISO 8601 UTC datetime ONLY when the email proposes a concrete meeting date AND time (e.g. Tuesday at 2pm), otherwise null",
  "scheduling_note": "short human phrase for the proposed meeting time, or null when not scheduling"
}
Categories:
- junk: marketing, newsletters, spam, bulk receipts, list mail
- client: client project updates, requests, files, approvals
- alert: uptime, security, monitoring, auth warnings
- internal: personal/admin not tied to a client job
- review: ambiguous — needs human decision
Pick job_slug only when confident; prefer active/inquiry jobs.
For proposed_meeting_start: require BOTH a specific date and time. Vague availability requests ("let's find a time", "next week") must be null. Deadlines and launch dates are NOT meetings.`;

  const user = [
    `From: ${email.from ?? ''}`,
    `Subject: ${email.subject ?? ''}`,
    contactName ? `Known contact: ${contactName}` : '',
    `Open jobs for this sender:\n${jobLines}`,
    '',
    'Body:',
    (email.text ?? '').slice(0, 4000),
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
    parsed.summary = String(parsed.summary ?? '').trim() || snippet(email.text ?? email.subject ?? '');
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
}): boolean {
  const action = opts.action.toLowerCase();
  const status = opts.ruleStatus.toUpperCase();

  if (opts.category === 'junk' || action === 'junk') return false;
  if (!opts.ruleNotify) return false;
  if (status === 'DELETE' || status === 'AUTO_ARCHIVED') return false;
  // Auto-sorted to a job — visible under Routed, no ping needed.
  if (action === 'filed' || action === 'matched') return false;

  return true;
}

export async function processInboundEmail(email: InboundEmail): Promise<ProcessedEmailResult> {
  const from = email.from ?? '';
  const senderEmail = parseSenderEmail(from);

  const { rules, notifyOnUnmatched } = await loadActiveEmailRules();
  const ruleResult = classifyEmail(email, rules, notifyOnUnmatched);
  let category: EmailCategory = ruleCategory(ruleResult.status);
  let summary = snippet(email.text ?? '') || email.subject || '(no subject)';
  let jobSlug: string | null = null;
  let jobTitle: string | null = null;
  let contactUid: string | null = null;
  let contactName: string | null = null;
  let routeNote = '';
  let action = 'classified';
  let proposedMeetingStart: string | null = null;
  let schedulingNote = '';

  const contactRes = senderEmail.includes('@')
    ? await resolveContact({ email: senderEmail })
    : null;
  const contact = contactRes?.ok ? extractContact(contactRes.data) : null;
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

  if (category !== 'junk' && aiEnabled()) {
    const ai = await runAiTriage(email, jobs, contactName);
    if (ai) {
      category = ai.category;
      summary = ai.summary;
      routeNote = ai.reason ?? '';
      proposedMeetingStart = ai.proposed_meeting_start;
      schedulingNote = ai.scheduling_note ?? '';
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

  const notify = shouldSendInboxPush({
    category,
    action,
    ruleNotify: ruleResult.notify,
    ruleStatus: ruleResult.status,
  });

  const record = await storeRecordEmailInbox({
    from,
    subject: email.subject ?? '',
    bodySnippet: snippet(email.text ?? ''),
    status: ruleResult.status,
    action,
    notified: notify,
    summary,
    category,
    contactUid,
    contactName,
    jobSlug,
    jobTitle,
    routeNote,
    proposedMeetingStart,
    schedulingNote,
  }).catch((e) => {
    console.warn('[email] inbox log failed', e);
    return null;
  });

  if (record?.id && jobSlug) {
    linkProjectItem(jobSlug, 'email', record.id).catch((e) =>
      console.warn('[email] project link failed', e),
    );
  }

  if (record && notify) {
    const pushTitle =
      isRailwayAlertStatus(ruleResult.status)
        ? `Railway: ${email.subject?.slice(0, 50) || 'deploy alert'}`
        : category === 'client'
          ? `Client: ${contactName ?? senderEmail}`
          : summary.slice(0, 60);
    sendInboxPushNotification({
      title: pushTitle,
      body: summary,
      tag: record.id,
      emailId: record.id,
    }).catch((e) => console.warn('[email] push failed', e));
  }

  if (category === 'alert' || isRailwayAlertStatus(ruleResult.status)) {
    notifyAdminAgentOfEmailAlert({
      status: ruleResult.status,
      from,
      subject: email.subject ?? '',
      summary,
      bodySnippet: snippet(email.text ?? ''),
      category,
      emailId: record?.id,
    }).catch((e) => console.warn('[email] agent alert failed', e));
  }

  return { ok: true, category, status: ruleResult.status, action, from, record };
}
