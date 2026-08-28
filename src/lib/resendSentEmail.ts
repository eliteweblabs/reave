/**
 * Fetch a sent transactional email from Resend (html + text + inline attachments).
 */
import {
  htmlHasCidImages,
  rewriteComposeHtmlForPreview,
  type EmailSendAttachment,
} from './emailComposeImages';
import { serverEnv } from './serverEnv';

export type ResendSentEmailContent = {
  html?: string;
  text?: string;
  subject?: string;
};

type ResendAttachmentMeta = {
  id: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
  content_id?: string;
  contentId?: string;
  download_url?: string;
  downloadUrl?: string;
};

function resendAuthHeaders(): HeadersInit | null {
  const key = serverEnv('RESEND_API_KEY')?.trim();
  if (!key) return null;
  return { Authorization: `Bearer ${key}` };
}

export async function fetchResendSentEmail(resendId: string): Promise<ResendSentEmailContent | null> {
  const headers = resendAuthHeaders();
  const id = resendId.trim();
  if (!headers || !id) return null;

  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, { headers });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return null;
    const rec = json as Record<string, unknown>;
    return {
      html: typeof rec.html === 'string' ? rec.html : undefined,
      text: typeof rec.text === 'string' ? rec.text : undefined,
      subject: typeof rec.subject === 'string' ? rec.subject : undefined,
    };
  } catch {
    return null;
  }
}

function asAttachmentList(json: unknown): ResendAttachmentMeta[] {
  if (Array.isArray(json)) return json as ResendAttachmentMeta[];
  if (json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data)) {
    return (json as { data: ResendAttachmentMeta[] }).data;
  }
  return [];
}

async function downloadAttachmentBytes(
  headers: HeadersInit,
  emailId: string,
  att: ResendAttachmentMeta,
): Promise<string | null> {
  const url = String(att.download_url || att.downloadUrl || '').trim();
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length) return buf.toString('base64');
      }
    } catch {
      /* fall through to authenticated get */
    }
  }

  const attId = String(att.id || '').trim();
  if (!attId) return null;
  try {
    const res = await fetch(
      `https://api.resend.com/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attId)}`,
      { headers },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object') return null;
    const rec = json as ResendAttachmentMeta;
    const nextUrl = String(rec.download_url || rec.downloadUrl || '').trim();
    if (!nextUrl) return null;
    const fileRes = await fetch(nextUrl);
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    return buf.length ? buf.toString('base64') : null;
  } catch {
    return null;
  }
}

export async function fetchResendSentAttachments(resendId: string): Promise<EmailSendAttachment[]> {
  const headers = resendAuthHeaders();
  const id = resendId.trim();
  if (!headers || !id) return [];

  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}/attachments`, {
      headers,
    });
    if (!res.ok) return [];
    const items = asAttachmentList(await res.json());
    const out: EmailSendAttachment[] = [];
    for (const item of items) {
      const content = await downloadAttachmentBytes(headers, id, item);
      const filename = String(item.filename || '').trim();
      if (!content || !filename) continue;
      const contentId = String(item.content_id || item.contentId || '').trim();
      const contentType = String(item.content_type || item.contentType || 'application/octet-stream').trim();
      out.push({
        filename,
        content,
        ...(contentId ? { contentId } : {}),
        ...(contentType ? { contentType } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Replace cid: images with data URLs from Resend so the Sent folder can render them. */
export async function hydrateSentHtmlCidImages(
  html: string,
  resendId?: string | null,
): Promise<{ html: string; hydrated: boolean }> {
  const raw = html.trim();
  if (!raw || !htmlHasCidImages(raw) || !resendId?.trim()) {
    return { html: raw, hydrated: false };
  }
  const attachments = await fetchResendSentAttachments(resendId);
  if (!attachments.length) return { html: raw, hydrated: false };
  const next = rewriteComposeHtmlForPreview(raw, attachments);
  return { html: next, hydrated: next !== raw };
}
