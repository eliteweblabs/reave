/**
 * Inbound email attachment metadata (Resend Receiving API).
 * Content is fetched on demand (Resend SDK v6+ returns base64 `content`; older paths use
 * signed `download_url`) — not stored in the inbox row.
 */

export interface EmailAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  contentDisposition?: string;
}

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
};

/** Fields returned by Resend receiving attachment get/list (SDK or raw API). */
export type ResendInboundAttachmentRecord = {
  id?: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
  content?: string;
  download_url?: string;
  downloadUrl?: string;
  size?: number;
};

/** Unwrap `{ object, data: { … } }` from the Resend SDK or accept a flat attachment record. */
export function unwrapResendInboundAttachmentRecord(raw: unknown): ResendInboundAttachmentRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const nested = rec.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    if (
      inner.id ||
      inner.content ||
      inner.download_url ||
      inner.downloadUrl ||
      inner.content_type ||
      inner.contentType
    ) {
      return inner as ResendInboundAttachmentRecord;
    }
  }
  return rec as ResendInboundAttachmentRecord;
}

export function resendInboundAttachmentContentType(record: ResendInboundAttachmentRecord): string {
  return String(record.content_type ?? record.contentType ?? '').trim();
}

export function resendInboundAttachmentFilename(
  record: ResendInboundAttachmentRecord,
  fallbackId: string,
): string {
  const id = String(record.id ?? fallbackId).trim() || fallbackId;
  return String(record.filename ?? '').trim() || `attachment-${id}`;
}

/** Load bytes from SDK base64 `content` or a signed `download_url`. */
export async function loadResendInboundAttachmentBytes(
  record: ResendInboundAttachmentRecord,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  const b64 = String(record.content ?? '').trim();
  if (b64) {
    try {
      const buf = Buffer.from(b64, 'base64');
      return buf.length ? buf : null;
    } catch {
      return null;
    }
  }

  const url = String(record.download_url ?? record.downloadUrl ?? '').trim();
  if (!url) return null;

  let upstream: Response;
  try {
    upstream = await fetchImpl(url);
  } catch {
    return null;
  }
  if (!upstream.ok) return null;
  const buf = Buffer.from(await upstream.arrayBuffer());
  return buf.length ? buf : null;
}

export function normalizeEmailAttachments(raw: unknown): EmailAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: EmailAttachmentMeta[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const att = item as ResendAttachmentLike;
    const id = String(att.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const filename = String(att.filename ?? '').trim() || `attachment-${id}`;
    const contentType = String(att.content_type ?? att.contentType ?? '').trim();
    const sizeRaw = Number(att.size);
    const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : 0;
    const contentId = String(att.content_id ?? att.contentId ?? '').trim();
    const contentDisposition = String(
      att.content_disposition ?? att.contentDisposition ?? '',
    ).trim();

    out.push({
      id,
      filename,
      contentType,
      size,
      ...(contentId ? { contentId } : {}),
      ...(contentDisposition ? { contentDisposition } : {}),
    });
  }

  return out;
}

export function formatAttachmentListForPrompt(attachments: EmailAttachmentMeta[]): string {
  if (!attachments.length) return '';
  return attachments
    .map((a) => {
      const type = a.contentType || 'unknown type';
      const size = a.size > 0 ? `, ${formatBytes(a.size)}` : '';
      return `- ${a.filename} (${type}${size})`;
    })
    .join('\n');
}

export function attachmentSummaryFallback(attachments: EmailAttachmentMeta[]): string {
  if (!attachments.length) return '';
  const names = attachments.map((a) => a.filename).filter(Boolean);
  if (names.length === 1) return `Attached: ${names[0]}`;
  if (names.length <= 3) return `Attached: ${names.join(', ')}`;
  return `Attached ${names.length} files: ${names.slice(0, 2).join(', ')}, +${names.length - 2} more`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
