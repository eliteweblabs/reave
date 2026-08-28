/**
 * Fetch a sent transactional email from Resend (html + text + attachments).
 */
import type { EmailAttachmentMeta } from './emailAttachments';
import {
  bindAttachmentsToCidHtml,
  emailHtmlHasCidImages,
  rewriteComposeHtmlForPreview,
  type EmailSendAttachment,
} from './emailComposeImages';
import { serverEnv } from './serverEnv';

export type ResendSentEmailContent = {
  html?: string;
  text?: string;
  subject?: string;
};

export type ResendSentAttachment = EmailAttachmentMeta & {
  downloadUrl?: string;
};

type ResendAttachmentLike = {
  id?: unknown;
  filename?: unknown;
  content_type?: unknown;
  contentType?: unknown;
  content_id?: unknown;
  contentId?: unknown;
  content_disposition?: unknown;
  contentDisposition?: unknown;
  size?: unknown;
  download_url?: unknown;
  downloadUrl?: unknown;
};

function resendAuthHeaders(): HeadersInit | null {
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) return null;
  return { Authorization: `Bearer ${key}` };
}

function normalizeSentAttachment(raw: ResendAttachmentLike): ResendSentAttachment | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  const filename = String(raw.filename ?? '').trim() || `attachment-${id}`;
  const contentType = String(raw.content_type ?? raw.contentType ?? '').trim();
  const sizeRaw = Number(raw.size);
  const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : 0;
  const contentId = String(raw.content_id ?? raw.contentId ?? '').trim();
  const contentDisposition = String(
    raw.content_disposition ?? raw.contentDisposition ?? '',
  ).trim();
  const downloadUrl = String(raw.download_url ?? raw.downloadUrl ?? '').trim();
  return {
    id,
    filename,
    contentType,
    size,
    ...(contentId ? { contentId } : {}),
    ...(contentDisposition ? { contentDisposition } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}

function attachmentListFromPayload(json: unknown): ResendSentAttachment[] {
  if (!json || typeof json !== 'object') return [];
  const rec = json as { data?: unknown };
  const raw = Array.isArray(json) ? json : Array.isArray(rec.data) ? rec.data : [];
  const out: ResendSentAttachment[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const att = normalizeSentAttachment(item as ResendAttachmentLike);
    if (!att || seen.has(att.id)) continue;
    seen.add(att.id);
    out.push(att);
  }
  return out;
}

async function resendGetJson(path: string): Promise<unknown | null> {
  const headers = resendAuthHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`https://api.resend.com${path}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchResendSentEmail(resendId: string): Promise<ResendSentEmailContent | null> {
  const id = resendId.trim();
  if (!id) return null;
  const json = await resendGetJson(`/emails/${encodeURIComponent(id)}`);
  if (!json || typeof json !== 'object') return null;
  const rec = json as Record<string, unknown>;
  return {
    html: typeof rec.html === 'string' ? rec.html : undefined,
    text: typeof rec.text === 'string' ? rec.text : undefined,
    subject: typeof rec.subject === 'string' ? rec.subject : undefined,
  };
}

export async function listResendSentAttachments(resendId: string): Promise<ResendSentAttachment[]> {
  const id = resendId.trim();
  if (!id) return [];
  const json = await resendGetJson(`/emails/${encodeURIComponent(id)}/attachments`);
  return attachmentListFromPayload(json);
}

export async function getResendSentAttachment(
  resendId: string,
  attachmentId: string,
): Promise<ResendSentAttachment | null> {
  const emailId = resendId.trim();
  const id = attachmentId.trim();
  if (!emailId || !id) return null;
  const json = await resendGetJson(
    `/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(id)}`,
  );
  if (!json || typeof json !== 'object') return null;
  return normalizeSentAttachment(json as ResendAttachmentLike);
}

export async function downloadResendSentAttachment(
  resendId: string,
  attachmentId: string,
): Promise<{ filename: string; contentType: string; bytes: Buffer } | null> {
  const listed = await getResendSentAttachment(resendId, attachmentId);
  if (!listed) return null;
  const downloadUrl = listed.downloadUrl?.trim();
  if (!downloadUrl) return null;
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return null;
    return {
      filename: listed.filename || `attachment-${attachmentId}`,
      contentType: listed.contentType || res.headers.get('content-type') || 'application/octet-stream',
      bytes,
    };
  } catch {
    return null;
  }
}

async function attachmentToSendPart(
  resendId: string,
  attachment: ResendSentAttachment,
): Promise<EmailSendAttachment | null> {
  const downloaded = await downloadResendSentAttachment(resendId, attachment.id);
  if (!downloaded) return null;
  return {
    filename: downloaded.filename,
    content: downloaded.bytes.toString('base64'),
    contentType: downloaded.contentType,
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  };
}

/** Replace leftover cid: images in stored sent HTML using Resend attachment bytes. */
export async function rewriteSentEmailCidImages(
  html: string,
  resendId: string | null | undefined,
): Promise<{ html: string; attachments: EmailAttachmentMeta[] }> {
  const attachments = resendId?.trim() ? await listResendSentAttachments(resendId) : [];
  const publicAttachments: EmailAttachmentMeta[] = attachments.map(
    ({ downloadUrl: _downloadUrl, ...meta }) => meta,
  );
  if (!html.trim() || !emailHtmlHasCidImages(html) || !attachments.length || !resendId?.trim()) {
    return { html, attachments: publicAttachments };
  }

  const parts: EmailSendAttachment[] = [];
  for (const attachment of attachments) {
    const part = await attachmentToSendPart(resendId, attachment);
    if (part) parts.push(part);
  }
  if (!parts.length) return { html, attachments: publicAttachments };

  return {
    html: rewriteComposeHtmlForPreview(html, bindAttachmentsToCidHtml(html, parts)),
    attachments: publicAttachments,
  };
}
