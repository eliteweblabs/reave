/**
 * Images attached from admin compose (paste / drop / file / library).
 * Stored on drafts as media-library refs; sent as CID inline attachments.
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
};

export type EmailSendAttachment = {
  filename: string;
  content: string;
  contentId?: string;
  contentType?: string;
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

export async function resolveComposeImagesForSend(raw: unknown): Promise<{
  images: EmailComposeImage[];
  attachments: EmailSendAttachment[];
  inline: EmailInlineImage[];
}> {
  const images = normalizeEmailComposeImages(raw);
  const attachments: EmailSendAttachment[] = [];
  const inline: EmailInlineImage[] = [];
  const { storeGetMedia } = await import('./mediaLibrary');

  for (const [index, image] of images.entries()) {
    const media = await storeGetMedia(image.mediaId);
    if (!media) {
      throw new Error(`Image ${image.filename || image.mediaId} is no longer in the library`);
    }
    const contentType = media.mediaType.trim().toLowerCase();
    if (!EMAIL_COMPOSE_IMAGE_TYPES.has(contentType)) {
      throw new Error(`${media.filename || 'File'} is not a JPEG, PNG, GIF, or WebP image`);
    }
    const cid = `compose-img-${index}`;
    attachments.push({
      filename: media.filename || `${cid}.png`,
      content: media.dataBase64,
      contentId: cid,
      contentType,
    });
    inline.push({ cid, alt: media.filename || image.filename || 'Image' });
  }

  return { images, attachments, inline };
}

/** Swap cid: refs for data URLs so a srcdoc preview can show attached images. */
export function rewriteComposeHtmlForPreview(html: string, attachments: EmailSendAttachment[]): string {
  let out = html;
  for (const attachment of attachments) {
    const cid = attachment.contentId?.trim();
    const content = attachment.content?.trim();
    if (!cid || !content) continue;
    const type = attachment.contentType || 'image/png';
    out = out.split(`cid:${cid}`).join(`data:${type};base64,${content}`);
  }
  return out;
}
