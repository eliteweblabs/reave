import { hasFeature } from '../../src/lib/features';
import { isEmailSendConfigured } from '../../src/lib/outbound';
import { resolveContactEnhanced } from '../../src/lib/clientSearch';
import { getContact } from '../../src/lib/contactApi';
import {
  isNewsletterEnabled,
  listUpcomingScheduledEmails,
  queueTemplateToContact,
} from '../../src/lib/newsletterEngine';
import {
  cancelNewsletterSends,
  getNewsletterSend,
  listNewsletterSends,
  rescheduleNewsletterSends,
} from '../../src/lib/newsletterStore';
import {
  listNewsletterTemplates,
  newsletterTemplateMeta,
} from '../../src/lib/newsletterTemplates';
import { resolveNewsletterTemplateId } from '../../src/lib/newsletterScheduleView';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function resolveRecipient(args: Record<string, unknown>): Promise<
  | { ok: true; contactUid?: string; toEmail?: string; name?: string }
  | { ok: false; error: string; candidates?: unknown }
> {
  const contactUid = String(args.contact_uid ?? '').trim();
  const toEmail = String(args.to_email ?? args.to ?? '').trim();
  const client = String(args.client ?? args.contact ?? args.name ?? '').trim();
  if (contactUid) {
    const got = await getContact(contactUid);
    if (!got.ok) return { ok: false, error: got.error || 'Contact not found' };
    return { ok: true, contactUid, toEmail: got.data.email || toEmail, name: got.data.name };
  }
  if (toEmail.includes('@') && !client) {
    return { ok: true, toEmail };
  }
  if (client || toEmail) {
    const result = await resolveContactEnhanced({
      name: client || undefined,
      email: toEmail.includes('@') ? toEmail : undefined,
    });
    if (!result.ok) return { ok: false, error: result.error };
    if ((result.match === 'exact' || result.match === 'likely') && result.contact?.uid) {
      const contact = result.contact;
      return { ok: true, contactUid: contact.uid, toEmail: contact.email || toEmail, name: contact.name };
    }
    if (result.candidates?.length) {
      return {
        ok: false,
        error: 'Multiple contacts matched — confirm which one, then pass contact_uid',
        candidates: result.candidates.map((c) => ({ uid: c.uid, name: c.name, email: c.email })),
      };
    }
    return { ok: false, error: 'Contact not found' };
  }
  return { ok: false, error: 'client, contact_uid, or to_email is required' };
}

async function handle_list_email_templates(): Promise<string> {
  const templates = listNewsletterTemplates().map(newsletterTemplateMeta);
  return JSON.stringify({ ok: true, templates });
}

async function handle_list_scheduled_emails(args: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(args.limit) || 20, 50);
  const scheduled = await listUpcomingScheduledEmails(limit);
  return JSON.stringify({ ok: true, scheduled });
}

async function handle_send_template_email(args: Record<string, unknown>): Promise<string> {
  if (!isNewsletterEnabled()) {
    return JSON.stringify({
      success: false,
      error: 'Newsletter sending is off (email_marketing + RESEND_API_KEY)',
    });
  }
  const templateRaw = String(args.template ?? args.template_id ?? '').trim();
  if (!templateRaw) return JSON.stringify({ success: false, error: 'template is required' });
  const templateId = resolveNewsletterTemplateId(templateRaw) || templateRaw;
  const recipient = await resolveRecipient(args);
  if (!recipient.ok) return JSON.stringify({ success: false, ...recipient });

  const dueAt = String(args.due_at ?? '').trim() || undefined;
  const sendNow = args.send_now === false || dueAt ? false : true;
  const result = await queueTemplateToContact({
    templateId,
    contactUid: recipient.contactUid,
    toEmail: recipient.toEmail,
    jobSlug: String(args.job_slug ?? '').trim() || undefined,
    subject: String(args.subject ?? '').trim() || undefined,
    dueAt,
    sendNow,
  });
  return JSON.stringify({
    ...result,
    success: result.ok,
    recipient: recipient.name || recipient.toEmail,
  });
}

async function handle_cancel_scheduled_email(args: Record<string, unknown>): Promise<string> {
  const id = String(args.id ?? args.send_id ?? '').trim();
  if (!id) return JSON.stringify({ success: false, error: 'id is required' });
  const send = await getNewsletterSend(id);
  const ids = send?.campaignId
    ? (await listNewsletterSends({ status: 'pending', campaignId: send.campaignId, limit: 500 })).map((s) => s.id)
    : send?.status === 'pending'
      ? [send.id]
      : [];
  if (!ids.length) return JSON.stringify({ success: false, error: 'No pending send found' });
  const updated = await cancelNewsletterSends(ids);
  return JSON.stringify({ success: true, updated, ids });
}

async function handle_reschedule_email(args: Record<string, unknown>): Promise<string> {
  const id = String(args.id ?? args.send_id ?? '').trim();
  const dueAt = String(args.due_at ?? '').trim();
  if (!id) return JSON.stringify({ success: false, error: 'id is required' });
  if (!dueAt) return JSON.stringify({ success: false, error: 'due_at is required' });
  const when = new Date(dueAt);
  if (Number.isNaN(when.getTime())) return JSON.stringify({ success: false, error: 'invalid due_at' });
  const send = await getNewsletterSend(id);
  const ids = send?.campaignId
    ? (await listNewsletterSends({ status: 'pending', campaignId: send.campaignId, limit: 500 })).map((s) => s.id)
    : send?.status === 'pending'
      ? [send.id]
      : [];
  if (!ids.length) return JSON.stringify({ success: false, error: 'No pending send found' });
  const updated = await rescheduleNewsletterSends(ids, when);
  return JSON.stringify({ success: true, updated, ids, dueAt: when.toISOString() });
}

export const emailMarketingAgentTools: AgentToolModule = {
  id: 'emailMarketing',
  enabled: () => hasFeature('email_marketing') && isEmailSendConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_email_templates',
          description:
            'List newsletter / lifecycle email templates (welcome, we value your opinion, review request, seasonal newsletter, etc.).',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_scheduled_emails',
          description:
            'List upcoming scheduled emails and broadcasts. Use when the owner asks what is going out, or to review a newsletter before it sends.',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max rows (default 20)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_template_email',
          description:
            'Send or schedule a named template to one client. Example: send the "we value your opinion" email to client ABC. Resolves the client by name if contact_uid is omitted.',
          parameters: {
            type: 'object',
            properties: {
              template: {
                type: 'string',
                description: 'Template id or label (e.g. value_your_opinion, "we value your opinion", review_request)',
              },
              client: { type: 'string', description: 'Client / contact name to resolve' },
              contact_uid: { type: 'string', description: 'Contact uid when already known' },
              to_email: { type: 'string', description: 'Recipient email if not resolving a contact' },
              job_slug: { type: 'string', description: 'Optional project slug to attach the send to' },
              subject: { type: 'string', description: 'Optional subject override' },
              due_at: { type: 'string', description: 'ISO datetime to schedule; omit to send now' },
              send_now: { type: 'boolean', description: 'Force immediate send (default true when due_at is omitted)' },
            },
            required: ['template'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_scheduled_email',
          description: 'Cancel a pending scheduled email or broadcast campaign.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Send id from list_scheduled_emails' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_email',
          description: 'Change when a pending scheduled email or broadcast will send.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Send id from list_scheduled_emails' },
              due_at: { type: 'string', description: 'New ISO datetime' },
            },
            required: ['id', 'due_at'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    list_email_templates: handle_list_email_templates,
    list_scheduled_emails: handle_list_scheduled_emails,
    send_template_email: handle_send_template_email,
    cancel_scheduled_email: handle_cancel_scheduled_email,
    reschedule_email: handle_reschedule_email,
  },
};
