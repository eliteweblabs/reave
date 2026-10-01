import { Resend } from 'resend';
import { handleInboundEmail } from './inboundEmailHandler';
import { inboundBelongsToInstall, recipientList } from './inboundEmailInstall';
import { normalizeEmailAttachments } from './emailAttachments';
import { storeFindExistingInboundEmail } from './emailInboxStore';
import { serverEnv } from './serverEnv';

type ReceivingListItem = {
  id: string;
  to?: string[];
  from?: string;
  subject?: string;
  message_id?: string;
  attachments?: unknown;
};

async function listPage(limit: number, after?: string) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (after) qs.set('after', after);
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch(`https://api.resend.com/emails/receiving?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json()) as { data?: ReceivingListItem[]; has_more?: boolean };
  if (!res.ok) {
    throw new Error(`Resend list failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { rows: json.data ?? [], hasMore: Boolean(json.has_more) };
}

async function ingestOne(resend: Resend, meta: ReceivingListItem, dryRun: boolean) {
  const id = meta.id?.trim();
  if (!id) return { action: 'skip', reason: 'no-id' as const };

  const metaRecipients = recipientList(meta.to);
  if (!inboundBelongsToInstall(metaRecipients, { requireRecipient: true })) {
    return { action: 'skip', reason: 'wrong-install' as const };
  }

  const existing = await storeFindExistingInboundEmail({
    resendEmailId: id,
    messageId: meta.message_id,
  });
  if (existing) return { action: 'skip', reason: 'exists' as const };

  if (dryRun) return { action: 'would-import' as const, subject: meta.subject ?? '' };

  const { data, error } = await resend.emails.receiving.get(id);
  if (error || !data) {
    return { action: 'error' as const, reason: String(error?.message ?? 'receiving.get failed') };
  }

  const rec = data as Record<string, unknown>;
  let attachments = normalizeEmailAttachments(meta.attachments);
  const fromGet = normalizeEmailAttachments((rec.attachments as unknown) ?? []);
  if (fromGet.length) attachments = fromGet;

  const headers =
    rec.headers && typeof rec.headers === 'object'
      ? Object.fromEntries(
          Object.entries(rec.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      : {};

  const result = await handleInboundEmail({
    from: String(rec.from ?? meta.from ?? ''),
    subject: String(rec.subject ?? meta.subject ?? ''),
    text: typeof rec.text === 'string' ? rec.text : '',
    html: typeof rec.html === 'string' ? rec.html : '',
    to: Array.isArray(rec.to) ? rec.to.map(String) : meta.to,
    cc: Array.isArray(rec.cc) ? rec.cc.map(String) : [],
    bcc: Array.isArray(rec.bcc) ? rec.bcc.map(String) : [],
    replyTo: Array.isArray(rec.reply_to) ? rec.reply_to.map(String) : [],
    headers,
    messageId: String(rec.message_id ?? meta.message_id ?? ''),
    resendEmailId: String(rec.id ?? id),
    attachments,
  });

  return { action: 'imported' as const, status: result.status, triage: result.action };
}

export async function backfillResendInbound(opts: {
  max?: number;
  dryRun?: boolean;
  /** Import messages before EMAIL_INBOUND_SINCE (Resend backlog after cutover). */
  ignoreInboundSince?: boolean;
}): Promise<{
  dryRun: boolean;
  max: number;
  listed: number;
  imported: number;
  would: number;
  skipped: number;
  errors: number;
}> {
  const dryRun = opts.dryRun === true;
  const max = Math.min(Math.max(opts.max ?? 300, 1), 2000);
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const prevInboundFilter = process.env.EMAIL_INBOUND_FILTER;
  if (opts.ignoreInboundSince !== false) {
    process.env.EMAIL_INBOUND_FILTER = '0';
  }
  const resend = new Resend(key);
  const stats = { listed: 0, imported: 0, skipped: 0, errors: 0, would: 0 };
  let after: string | undefined;
  const pageSize = 40;

  try {
    while (stats.listed < max) {
      const { rows, hasMore } = await listPage(Math.min(pageSize, max - stats.listed), after);
      if (!rows.length) break;
      for (const row of rows) {
        if (stats.listed >= max) break;
        stats.listed += 1;
        const out = await ingestOne(resend, row, dryRun);
        if (out.action === 'imported') stats.imported += 1;
        else if (out.action === 'would-import') stats.would += 1;
        else if (out.action === 'error') stats.errors += 1;
        else stats.skipped += 1;
        after = row.id;
      }
      if (!hasMore) break;
    }
  } finally {
    if (prevInboundFilter === undefined) delete process.env.EMAIL_INBOUND_FILTER;
    else process.env.EMAIL_INBOUND_FILTER = prevInboundFilter;
  }

  return { dryRun, max, ...stats };
}
