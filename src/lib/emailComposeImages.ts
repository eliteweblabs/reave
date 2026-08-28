/**
 * Images attached from admin compose (paste / drop / file / library).
 * Stored on drafts as media-library refs. Sent as downloadable attachments
 * plus hosted <img> URLs so Sent and the recipient both see the file.
 * Older mail used cid:compose-img-N; the sent viewer rewrites those.
 */

const MEDIA_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EMAIL_COMPOSE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export const EMAIL_COMPOSE_MAX_IMAGES = 8;

export type EmailComposeImage = {
  mediaId: string;
  url?: string;
  filename?: string;
  contentType?: string;
};

export type EmailInlineImage = {
  cid: string;
  alt: string;
  /** Absolute https URL for the sent/preview HTML. Preferred over cid. */
  src?: string;
};

export type EmailSendAttachment = {
  filename: string;
  content: string;
  contentId?: string;
  contentType?: string;
};

export type CidHtmlImage = {
  cid: string;
  alt: string;
};

export function normalizeEmailComposeImages(raw: unknown): EmailComposeImage[] {
  if (!Array.isArray(raw)) return [];
  const out: EmailComposeImage[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= EMAIL_COMPOSE_MAX_IMAGES) break;
    let mediaId = '';
    let url = '';
    let filename = '';
    let contentType = '';
    if (typeof item === 'string') {
      mediaId = item.trim();
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      mediaId = String(obj.mediaId ?? obj.id ?? '').trim();
      url = String(obj.url ?? obj.publicUrl ?? '').trim();
      filename = String(obj.filename ?? '').trim();
      contentType = String(obj.contentType ?? obj.mediaType ?? '')
        .trim()
        .toLowerCase();
    }
    if (!mediaId || !MEDIA_ID_RE.test(mediaId) || seen.has(mediaId)) continue;
    seen.add(mediaId);
    if (contentType && !EMAIL_COMPOSE_IMAGE_TYPES.has(contentType)) continue;
    out.push({
      mediaId,
      ...(url ? { url } : {}),
      ...(filename ? { filename } : {}),
      ...(contentType ? { contentType } : {}),
    });
  }
  return out;
}

export function composeImageAbsoluteUrl(baseUrl: string, publicPath: string): string {
  const path = String(publicPath || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

export function inlineImageSrc(image: EmailInlineImage): string {
  const hosted = image.src?.trim();
  if (hosted) return hosted;
  const cid = image.cid.trim();
  return cid ? `cid:${cid}` : '';
}

export function listCidImagesInHtml(html: string): CidHtmlImage[] {
  const out: CidHtmlImage[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(html || '')))) {
    const tag = match[0];
    const src = /\bsrc\s*=\s*["']cid:([^"']+)["']/i.exec(tag);
    if (!src?.[1]) continue;
    const cid = src[1].trim();
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || '';
    out.push({ cid, alt });
  }
  return out;
}

export function emailHtmlHasCidImages(html: string): boolean {
  return listCidImagesInHtml(html).length > 0;
}

export function bindAttachmentsToCidHtml<T extends { filename?: string; contentId?: string }>(
  html: string,
  attachments: T[],
): T[] {
  const images = listCidImagesInHtml(html);
  if (!images.length) return attachments.map((a) => ({ ...a }));
  const out = attachments.map((a) => ({ ...a }));
  const usedCids = new Set<string>();

  for (const att of out) {
    const existing = att.contentId?.trim();
    if (existing && images.some((img) => img.cid === existing)) {
      usedCids.add(existing);
    }
  }

  for (const att of out) {
    if (att.contentId?.trim() && usedCids.has(att.contentId.trim())) continue;
    const name = String(att.filename || '')
      .trim()
      .toLowerCase();
    const match = images.find(
      (img) => !usedCids.has(img.cid) && name && img.alt.trim().toLowerCase() === name,
    );
    if (!match) continue;
    att.contentId = match.cid;
    usedCids.add(match.cid);
  }

  const leftover = images.filter((img) => !usedCids.has(img.cid));
  for (const att of out) {
    if (att.contentId?.trim()) continue;
    const next = leftover.shift();
    if (!next) break;
    att.contentId = next.cid;
  }

  return out;
}

export async function resolveComposeImagesForSend(
  raw: unknown,
  opts?: { baseUrl?: string },
): Promise<{
  images: EmailComposeImage[];
  attachments: EmailSendAttachment[];
  inline: EmailInlineImage[];
}> {
  const images = normalizeEmailComposeImages(raw);
  const attachments: EmailSendAttachment[] = [];
  const inline: EmailInlineImage[] = [];
  const { mediaLibraryUrl, storeGetMedia } = await import('./mediaLibrary');
  const { siteBaseUrl } = await import('./requestOrigin');
  const baseUrl = (opts?.baseUrl || siteBaseUrl()).replace(/\/+$/, '');

  for (const [index, image] of images.entries()) {
    const media = await storeGetMedia(image.mediaId);
    if (!media) {
      throw new Error(`Image ${image.filename || image.mediaId} is no longer in the library`);
    }
    const contentType = media.mediaType.trim().toLowerCase();
    if (!EMAIL_COMPOSE_IMAGE_TYPES.has(contentType)) {
      throw new Error(`${media.filename || 'File'} is not a JPEG, PNG, GIF, or WebP image`);
    }
    const content = String(media.dataBase64 || '').trim();
    if (!content) {
      throw new Error(`${media.filename || 'Image'} has no file data`);
    }
    const cid = `compose-img-${index}`;
    const filename = media.filename || `${cid}.png`;
    const src = composeImageAbsoluteUrl(baseUrl, media.publicUrl || mediaLibraryUrl(media.id));
    attachments.push({
      filename,
      content,
      contentType,
    });
    inline.push({
      cid,
      alt: filename,
      ...(src ? { src } : {}),
    });
  }

  return { images, attachments, inline };
}

/** Swap cid: refs for data URLs so a srcdoc preview can show attached images. */
export function rewriteComposeHtmlForPreview(html: string, attachments: EmailSendAttachment[]): string {
  let out = html;
  const bound = bindAttachmentsToCidHtml(html, attachments);
  for (const attachment of bound) {
    const cid = attachment.contentId?.trim();
    const content = attachment.content?.trim();
    if (!cid || !content) continue;
    const type = attachment.contentType || 'image/png';
    out = out.split(`cid:${cid}`).join(`data:${type};base64,${content}`);
  }
  return out;
}
