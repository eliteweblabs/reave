/**
 * Newsletter automation engine — turns app events into scheduled emails, then
 * sends them when they're due.
 *
 * Flow:
 *   event (contact created / job done)
 *     → enqueue one scheduled send per enabled automation (with a delay)
 *   scheduler tick
 *     → processDueSends(): for each due send, apply the "how" rules
 *       (suppression list, send window, skip-if-converted) then send.
 */
import { hasFeature } from './features';
import { isEmailSendConfigured, sendEmail } from './outbound';
import { getCompanyConfig } from './companyConfig';
import { siteBaseUrl } from './requestOrigin';
import type { ContactRecord } from './contactApi';
import { contactIsPersonal, getClientKind, getContact } from './contactApi';
import { storeListWork } from './workStore';
import {
  automationsForTrigger,
  getAutomationDef,
  mergeAutomation,
  type NewsletterTrigger,
} from './newsletterAutomations';
import {
  getAutomationOverrides,
  enqueueNewsletterSend,
  listDueNewsletterSends,
  listNewsletterSends,
  updateNewsletterSend,
  isUnsubscribed,
  type NewsletterSend,
} from './newsletterStore';
import {
  getNewsletterTemplate,
  renderNewsletterEmail,
  type NewsletterTemplateContext,
  type NewsletterTemplateId,
} from './newsletterTemplates';
import { makeUnsubscribeToken } from './newsletterUnsubscribe';
import { serverEnv } from './serverEnv';
import { isSleepModeActive } from './pushQuietHours';
import { logOutboundEmailForProject } from './logOutboundEmailForProject';
import { randomUUID } from 'crypto';
import {
  groupScheduledSends,
  resolveNewsletterTemplateId,
  type ScheduledEmailItem,
} from './newsletterScheduleView';

export function isNewsletterEnabled(): boolean {
  return hasFeature('email_marketing') && isEmailSendConfigured();
}

function firstNameOf(input: { firstName?: string | null; name?: string | null }): string {
  const explicit = (input.firstName || '').trim();
  if (explicit) return explicit;
  const name = (input.name || '').trim();
  return name ? (name.split(/\s+/)[0] || '') : '';
}

function unsubscribeUrlFor(email: string): string {
  const base = siteBaseUrl().replace(/\/+$/, '');
  return `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(email))}`;
}

// ─────────────────────────── send-window rules ───────────────────────────

interface SendWindow {
  startHour: number;
  endHour: number;
  weekends: boolean;
}

function sendWindow(): SendWindow {
  const start = Number(serverEnv('NEWSLETTER_SEND_WINDOW_START'));
  const end = Number(serverEnv('NEWSLETTER_SEND_WINDOW_END'));
  const weekends = String(serverEnv('NEWSLETTER_SEND_ON_WEEKENDS') || '').toLowerCase() === 'true';
  return {
    startHour: Number.isFinite(start) ? Math.max(0, Math.min(23, start)) : 8,
    endHour: Number.isFinite(end) ? Math.max(1, Math.min(24, end)) : 20,
    weekends,
  };
}

/** Whether the current server time is inside the allowed send window. */
export function isWithinSendWindow(now = new Date()): boolean {
  const w = sendWindow();
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  if (!w.weekends && (day === 0 || day === 6)) return false;
  const hour = now.getHours();
  return hour >= w.startHour && hour < w.endHour;
}

// ─────────────────────────── event → queue ───────────────────────────

async function enqueueForTrigger(
  trigger: NewsletterTrigger,
  opts: {
    contactUid: string | null;
    toEmail: string;
    firstName: string;
    dedupSuffix: string;
    jobSlug?: string | null;
    context: NewsletterTemplateContext;
  },
): Promise<void> {
  const overrides = await getAutomationOverrides();
  const now = Date.now();
  for (const def of automationsForTrigger(trigger)) {
    const cfg = mergeAutomation(def, overrides[def.id]);
    if (!cfg.enabled) continue;
    const dueAt = new Date(now + cfg.delayMinutes * 60_000);
    await enqueueNewsletterSend({
      templateId: cfg.templateId,
      source: cfg.id,
      trigger,
      contactUid: opts.contactUid,
      toEmail: opts.toEmail,
      firstName: opts.firstName,
      dueAt,
      jobSlug: opts.jobSlug ?? null,
      context: opts.context as unknown as Record<string, unknown>,
      dedupKey: `${cfg.id}:${opts.dedupSuffix}`,
    });
  }
}

/** Fire when a brand-new contact is created (welcome + follow-up). */
export async function onContactCreated(contact: ContactRecord): Promise<void> {
  if (!isNewsletterEnabled()) return;
  if (contactIsPersonal(contact) || getClientKind(contact) === 'proposed' || getClientKind(contact) === 'service') return;
  const email = (contact.email || '').trim();
  if (!email.includes('@')) return;
  if (await isUnsubscribed(email)) return;

  const company = await getCompanyConfig();
  const firstName = firstNameOf(contact) || 'there';
  await enqueueForTrigger('contact_created', {
    contactUid: contact.uid,
    toEmail: email,
    firstName,
    dedupSuffix: contact.uid,
    context: {
      firstName,
      companyName: company.name,
      ctaUrl: siteBaseUrl().replace(/\/+$/, ''),
    },
  });
}

/** Fire when a job transitions to "done" (project-complete + review request). */
export async function onJobCompleted(job: {
  slug: string;
  title: string;
  contact_uid?: string | null;
  contact_name?: string | null;
}): Promise<void> {
  if (!isNewsletterEnabled()) return;
  const contactUid = (job.contact_uid || '').trim();
  if (!contactUid) return;

  const result = await getContact(contactUid);
  if (!result.ok) return;
  const email = (result.data.email || '').trim();
  if (!email.includes('@')) return;
  if (await isUnsubscribed(email)) return;

  const company = await getCompanyConfig();
  const firstName = firstNameOf(result.data) || firstNameOf({ name: job.contact_name }) || 'there';
  const reviewUrl = serverEnv('NEWSLETTER_REVIEW_URL')?.trim() || undefined;

  await enqueueForTrigger('job_completed', {
    contactUid,
    toEmail: email,
    firstName,
    dedupSuffix: job.slug,
    jobSlug: job.slug,
    context: {
      firstName,
      companyName: company.name,
      projectTitle: job.title,
      ctaUrl: siteBaseUrl().replace(/\/+$/, ''),
      reviewUrl,
    },
  });
}

// ─────────────────────────── broadcasts ───────────────────────────

export interface BroadcastInput {
  templateId: NewsletterTemplateId;
  /** 'all' = every contact with an email; otherwise specific contact uids. */
  audience: 'all' | string[];
  subject?: string;
  heading?: string;
  /** Body paragraphs (used by broadcast templates). */
  body?: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  /** Cap for a single broadcast run. */
  limit?: number;
  /** When set, queue for this time instead of immediately. */
  dueAt?: Date | string;
  /** Optional campaign id so the dashboard can treat the batch as one row. */
  campaignId?: string;
}

export interface BroadcastResult {
  ok: boolean;
  queued: number;
  skippedUnsub: number;
  skippedNoEmail: number;
  campaignId?: string;
  dueAt?: string;
  error?: string;
}

/** Enqueue an immediate send to each recipient in the segment. */
export async function queueBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  if (!isNewsletterEnabled()) {
    return { ok: false, queued: 0, skippedUnsub: 0, skippedNoEmail: 0, error: 'newsletter disabled' };
  }
  const { listContacts } = await import('./contactApi');
  const company = await getCompanyConfig();
  const cap = Math.max(1, Math.min(input.limit ?? 2000, 5000));

  let recipients: ContactRecord[] = [];
  if (input.audience === 'all') {
    const res = await listContacts({ limit: cap });
    if (!res.ok) return { ok: false, queued: 0, skippedUnsub: 0, skippedNoEmail: 0, error: res.error };
    recipients = res.data.contacts;
  } else {
    for (const uid of input.audience.slice(0, cap)) {
      const res = await getContact(uid);
      if (res.ok) recipients.push(res.data);
    }
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : new Date();
  const campaignId = input.campaignId?.trim() || randomUUID();
  let queued = 0;
  let skippedUnsub = 0;
  let skippedNoEmail = 0;
  for (const contact of recipients) {
    const email = (contact.email || '').trim();
    if (!email.includes('@')) {
      skippedNoEmail += 1;
      continue;
    }
    if (await isUnsubscribed(email)) {
      skippedUnsub += 1;
      continue;
    }
    const firstName = firstNameOf(contact) || 'there';
    const context: NewsletterTemplateContext = {
      firstName,
      companyName: company.name,
      subject: input.subject,
      heading: input.heading,
      body: input.body,
      ctaUrl: input.ctaUrl,
      ctaLabel: input.ctaLabel,
    };
    const enq = await enqueueNewsletterSend({
      templateId: input.templateId,
      source: 'broadcast',
      trigger: 'broadcast',
      contactUid: contact.uid,
      toEmail: email,
      firstName,
      subject: input.subject,
      dueAt,
      context: context as unknown as Record<string, unknown>,
      dedupKey: null,
      campaignId,
    });
    if (enq) queued += 1;
  }

  return { ok: true, queued, skippedUnsub, skippedNoEmail, campaignId, dueAt: dueAt.toISOString() };
}

export async function listUpcomingScheduledEmails(limit = 40): Promise<ScheduledEmailItem[]> {
  const sends = await listNewsletterSends({ status: 'pending', upcoming: true, limit: 200 });
  return groupScheduledSends(sends).slice(0, limit);
}

export interface TemplateSendInput {
  templateId: string;
  contactUid?: string;
  toEmail?: string;
  jobSlug?: string | null;
  subject?: string;
  heading?: string;
  body?: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  dueAt?: Date | string;
  sendNow?: boolean;
}

export interface TemplateSendResult {
  ok: boolean;
  queued: number;
  sent?: number;
  sendId?: string;
  dueAt?: string;
  templateId?: string;
  toEmail?: string;
  error?: string;
}

/** Queue (or immediately send) a named template to one contact. */
export async function queueTemplateToContact(input: TemplateSendInput): Promise<TemplateSendResult> {
  if (!isNewsletterEnabled()) {
    return { ok: false, queued: 0, error: 'newsletter disabled' };
  }
  const resolvedId = resolveNewsletterTemplateId(input.templateId) || input.templateId.trim();
  if (!getNewsletterTemplate(resolvedId)) {
    return { ok: false, queued: 0, error: `Unknown template: ${input.templateId}` };
  }

  let contact: ContactRecord | null = null;
  const uid = (input.contactUid || '').trim();
  if (uid) {
    const res = await getContact(uid);
    if (res.ok) contact = res.data;
  }
  const email = (input.toEmail || contact?.email || '').trim();
  if (!email.includes('@')) {
    return { ok: false, queued: 0, error: 'Recipient email is required' };
  }
  if (await isUnsubscribed(email)) {
    return { ok: false, queued: 0, error: 'Recipient is unsubscribed' };
  }

  const company = await getCompanyConfig();
  const firstName = firstNameOf(contact || {}) || firstNameOf({ name: contact?.name }) || 'there';
  let jobSlug = input.jobSlug?.trim() || null;
  let projectTitle: string | undefined;
  if (jobSlug) {
    try {
      const { storeReadWork } = await import('./workStore');
      const job = await storeReadWork(jobSlug);
      projectTitle = job?.title;
    } catch {
      /* ignore */
    }
  } else if (contact?.uid) {
    try {
      const jobs = await storeListWork({ contact_uid: contact.uid });
      const done = jobs.find((j) => j.status === 'archived');
      const pick = done || jobs.find((j) => j.status === 'active') || jobs[0];
      if (pick) {
        jobSlug = pick.slug;
        projectTitle = pick.title;
      }
    } catch {
      /* ignore */
    }
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : new Date();
  if (Number.isNaN(dueAt.getTime())) {
    return { ok: false, queued: 0, error: 'Invalid dueAt' };
  }

  const reviewUrl = serverEnv('NEWSLETTER_REVIEW_URL')?.trim() || undefined;
  const context: NewsletterTemplateContext = {
    firstName,
    companyName: company.name,
    projectTitle,
    subject: input.subject,
    heading: input.heading,
    body: input.body,
    ctaUrl: input.ctaUrl,
    ctaLabel: input.ctaLabel,
    reviewUrl,
  };

  const enq = await enqueueNewsletterSend({
    templateId: resolvedId,
    source: 'manual',
    trigger: 'manual',
    contactUid: contact?.uid || uid || null,
    toEmail: email,
    firstName,
    subject: input.subject,
    dueAt,
    jobSlug,
    context: context as unknown as Record<string, unknown>,
    dedupKey: null,
  });
  if (!enq) return { ok: false, queued: 0, error: 'Failed to queue send' };

  let sent = 0;
  if (input.sendNow !== false && dueAt.getTime() <= Date.now() + 5_000) {
    const proc = await processDueNewsletterSends({ limit: 25, ignoreWindow: true });
    sent = proc.sent;
  }

  return {
    ok: true,
    queued: 1,
    sent,
    sendId: enq.id,
    dueAt: enq.dueAt,
    templateId: resolvedId,
    toEmail: email,
  };
}

// ─────────────────────────── queue → send ───────────────────────────

/** Skip a follow-up if the contact already converted (has a project). */
async function shouldSkipConverted(send: NewsletterSend): Promise<boolean> {
  const def = getAutomationDef(send.source);
  if (!def?.skipIfConverted || !send.contactUid) return false;
  try {
    const jobs = await storeListWork({ contact_uid: send.contactUid });
    return (jobs?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

type DeliveryOutcome = 'sent' | 'skipped' | 'failed';

async function deliverSend(send: NewsletterSend): Promise<DeliveryOutcome> {
  const email = send.toEmail.trim();
  if (!email.includes('@')) {
    await updateNewsletterSend(send.id, { status: 'skipped', error: 'invalid recipient' });
    return 'skipped';
  }
  if (await isUnsubscribed(email)) {
    await updateNewsletterSend(send.id, { status: 'skipped', error: 'unsubscribed' });
    return 'skipped';
  }
  if (await shouldSkipConverted(send)) {
    await updateNewsletterSend(send.id, { status: 'skipped', error: 'contact already converted' });
    return 'skipped';
  }

  const unsubscribeUrl = unsubscribeUrlFor(email);
  const context = (send.context || {}) as unknown as NewsletterTemplateContext;
  if (!context.firstName) context.firstName = send.firstName || 'there';

  const rendered = await renderNewsletterEmail({
    templateId: send.templateId as NewsletterTemplateId,
    context,
    unsubscribeUrl,
    subjectOverride: send.subject || undefined,
  });
  if ('error' in rendered) {
    await updateNewsletterSend(send.id, { status: 'failed', error: rendered.error });
    return 'failed';
  }

  const result = await sendEmail({
    to: email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  if (result.ok) {
    await updateNewsletterSend(send.id, {
      status: 'sent',
      sentAt: new Date().toISOString(),
      subject: rendered.subject,
      resendId: result.id ?? null,
      error: null,
    });
    void logOutboundEmailForProject({
      toEmail: email,
      subject: rendered.subject,
      resendId: result.id,
      source: `newsletter:${send.source || send.templateId}`,
      jobSlug: send.jobSlug,
      contactUid: send.contactUid,
    });
    return 'sent';
  }
  await updateNewsletterSend(send.id, { status: 'failed', error: result.error });
  return 'failed';
}

export interface ProcessResult {
  ok: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  deferred: boolean;
  error?: string;
}

let _processing = false;

/** Send everything that is due (respecting the send window unless forced). */
export async function processDueNewsletterSends(
  opts: { limit?: number; ignoreWindow?: boolean } = {},
): Promise<ProcessResult> {
  const limit = opts.limit ?? 25;
  const empty: ProcessResult = { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, deferred: false };
  if (!isNewsletterEnabled()) return { ...empty, ok: false, error: 'newsletter disabled' };
  if (_processing) return { ...empty, error: 'already running' };

  if (!opts.ignoreWindow && !isWithinSendWindow()) {
    // Leave everything pending; a later tick inside the window will pick it up.
    return { ...empty, deferred: true };
  }

  if (!opts.ignoreWindow && (await isSleepModeActive())) {
    return { ...empty, deferred: true };
  }

  _processing = true;
  try {
    const due = await listDueNewsletterSends(limit);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const send of due) {
      const outcome = await deliverSend(send);
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'skipped') skipped += 1;
      else failed += 1;
    }
    return { ok: true, processed: due.length, sent, skipped, failed, deferred: false };
  } catch (e) {
    return { ...empty, ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    _processing = false;
  }
}
