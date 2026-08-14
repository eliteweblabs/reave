/**
 * GET /api/work/:slug/emails — inbound, outbound, and scheduled email record.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { listRelatedForJob } from '../../../../lib/projectLinks';
import { storeListEmailInboxByJob, storeGetEmailInbox } from '../../../../lib/emailInboxStore';
import { listOutboundEmailsByJob } from '../../../../lib/projectOutboundEmail';
import { listNewsletterSends } from '../../../../lib/newsletterStore';
import { formatScheduledEmailTitle, templateLabelFor } from '../../../../lib/newsletterScheduleView';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export type ProjectEmailRecord = {
  id: string;
  direction: 'inbound' | 'outbound' | 'scheduled';
  at: string;
  subject: string;
  fromTo: string;
  status: string;
  source: string;
  templateId?: string;
  templateLabel?: string;
  title?: string;
  emailId?: string;
  sendId?: string;
  campaignId?: string | null;
  sendIds?: string[];
};

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  const job = await storeReadWork(slug);
  if (!job) return json({ ok: false, error: 'Not found' }, 404);

  const [related, inbox, outbound, newsletter] = await Promise.all([
    listRelatedForJob(slug),
    storeListEmailInboxByJob(slug, 80),
    listOutboundEmailsByJob(slug, 80),
    listNewsletterSends({ jobSlug: slug, limit: 80 }),
  ]);

  const inboundById = new Map(inbox.map((e) => [e.id, e]));
  for (const linked of related.emails || []) {
    if (inboundById.has(linked.id)) continue;
    const full = await storeGetEmailInbox(linked.id);
    if (full) inboundById.set(full.id, full);
  }

  const records: ProjectEmailRecord[] = [];

  for (const email of inboundById.values()) {
    records.push({
      id: `in:${email.id}`,
      direction: 'inbound',
      at: email.receivedAt,
      subject: email.subject || '(no subject)',
      fromTo: email.from || '',
      status: email.action || email.status || 'received',
      source: 'inbox',
      emailId: email.id,
    });
  }

  for (const row of outbound) {
    records.push({
      id: `out:${row.id}`,
      direction: 'outbound',
      at: row.sentAt,
      subject: row.subject || '(no subject)',
      fromTo: row.toEmail,
      status: 'sent',
      source: row.source || 'outbound',
    });
  }

  for (const send of newsletter) {
    const label = templateLabelFor(send.templateId);
    const pending = send.status === 'pending';
    const copy = pending
      ? formatScheduledEmailTitle({
          id: send.id,
          kind: 'single',
          campaignId: send.campaignId,
          sendIds: [send.id],
          templateId: send.templateId,
          templateLabel: label,
          source: send.source,
          subject: send.subject,
          toLabel: send.firstName || send.toEmail,
          toEmail: send.toEmail,
          contactUid: send.contactUid,
          firstName: send.firstName,
          recipientCount: 1,
          dueAt: send.dueAt,
          jobSlug: send.jobSlug,
          jobTitle: job.title,
        })
      : null;
    records.push({
      id: `nl:${send.id}`,
      direction: pending ? 'scheduled' : 'outbound',
      at: pending ? send.dueAt : send.sentAt || send.dueAt,
      subject: send.subject || label,
      fromTo: send.toEmail,
      status: send.status,
      source: send.source,
      templateId: send.templateId,
      templateLabel: label,
      title: copy?.title,
      sendId: send.id,
      campaignId: send.campaignId,
      sendIds: [send.id],
    });
  }

  records.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return json({
    ok: true,
    jobSlug: slug,
    jobTitle: job.title,
    emails: records,
  });
}
