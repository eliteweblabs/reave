import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { serverEnv } from '../../../lib/serverEnv';
import { getCompanyBrandContext } from '../../../lib/companyConfig';
import { handleInboundEmail } from '../../../lib/inboundEmailHandler';
import { ensureEmailCleanupScheduler } from '../../../lib/emailCleanupScheduler';
import { ensureSeededInboxClearedOnLiveEmail } from '../../../lib/seededInboxCleanup';
import { normalizeEmailAttachments } from '../../../lib/emailAttachments';
import { inboundBelongsToInstall, recipientList } from '../../../lib/inboundEmailInstall';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const brand = await getCompanyBrandContext(request);
  return new Response(
    JSON.stringify({
      ok: true,
      service: `${brand.name.toLowerCase().replace(/\s+/g, '-')}-email-inbound`,
      time: new Date().toISOString(),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request }) => {
  const apiKey = serverEnv('RESEND_API_KEY');
  const secret = serverEnv('RESEND_WEBHOOK_SECRET');

  if (!apiKey?.trim() || !secret?.trim()) {
    return new Response(
      JSON.stringify({ ok: false, error: 'RESEND_API_KEY / RESEND_WEBHOOK_SECRET not set' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  await ensureSeededInboxClearedOnLiveEmail().catch(() => undefined);

  // Raw body is required for signature verification.
  const payload = await request.text();
  const resend = new Resend(apiKey);

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    });
  } catch (e) {
    console.warn('[email] webhook verification failed', e);
    return new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (event.type !== 'email.received') {
    return new Response(JSON.stringify({ ok: true, action: 'ignored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const meta = event.data as {
      email_id?: string;
      from?: string;
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject?: string;
      attachments?: unknown;
    };
    const metaRecipients = recipientList(meta.to, meta.cc, meta.bcc);
    if (!inboundBelongsToInstall(metaRecipients, { requireRecipient: false })) {
      console.info('[email] ignored other-install inbound', {
        to: meta.to,
        subject: meta.subject ?? '',
      });
      return new Response(
        JSON.stringify({ ok: true, action: 'ignored', status: 'WRONG_INSTALL' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let from = meta.from ?? '';
    let subject = meta.subject ?? '';
    let text = '';
    let html = '';
    let to: string[] = [];
    let cc: string[] = [];
    let bcc: string[] = [];
    let replyTo: string[] = [];
    let headers: Record<string, string> = {};
    let messageId = '';
    let resendEmailId = meta.email_id ?? '';
    // Webhook includes attachment metadata; receiving.get may refresh/enrich it.
    let attachments = normalizeEmailAttachments(meta.attachments);

    // The webhook payload carries metadata only; fetch the full email for the body.
    if (meta.email_id) {
      const { data, error } = await resend.emails.receiving.get(meta.email_id);
      if (error) {
        console.warn('[email] receiving.get error', error);
      } else if (data) {
        from = data.from || from;
        subject = data.subject || subject;
        text = data.text ?? '';
        html = data.html ?? '';
        to = Array.isArray(data.to) ? data.to.map(String) : [];
        cc = Array.isArray(data.cc) ? data.cc.map(String) : [];
        bcc = Array.isArray(data.bcc) ? data.bcc.map(String) : [];
        replyTo = Array.isArray(data.reply_to) ? data.reply_to.map(String) : [];
        headers =
          data.headers && typeof data.headers === 'object'
            ? Object.fromEntries(
                Object.entries(data.headers as Record<string, unknown>).map(([k, v]) => [
                  k,
                  String(v),
                ]),
              )
            : {};
        messageId = data.message_id ?? '';
        resendEmailId = data.id ?? resendEmailId;
        const fromGet = normalizeEmailAttachments(
          (data as { attachments?: unknown }).attachments,
        );
        if (fromGet.length) attachments = fromGet;
      }
    }

    // If get() omitted attachments but we have an email id, list them explicitly.
    if (!attachments.length && resendEmailId) {
      const { data: attList, error: attErr } = await resend.emails.receiving.attachments.list({
        emailId: resendEmailId,
      });
      if (attErr) {
        console.warn('[email] attachments.list error', attErr);
      } else {
        attachments = normalizeEmailAttachments(attList?.data ?? attList);
      }
    }

    const result = await handleInboundEmail({
      from,
      subject,
      text,
      html,
      to,
      cc,
      bcc,
      replyTo,
      headers,
      messageId,
      resendEmailId,
      attachments,
    });
    ensureEmailCleanupScheduler();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[email] inbound handler error', e);
    // Always 200 so Resend does not retry a message we already received.
    return new Response(JSON.stringify({ ok: false, action: 'error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
