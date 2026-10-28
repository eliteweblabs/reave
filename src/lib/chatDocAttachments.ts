import type { ChatDocAttachment } from './chatTypes';
import { labelForDocMediaType } from './chatTypes';
import { PPTX_MEDIA_TYPE } from './chatDocConfig';
import { extractPptxText } from './pptxText';
import { extractZipTextFiles } from './zipTextExtract';

const ZIP_MEDIA_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);

const TEXT_LIKE_DOC_TYPES = new Set([
  'application/json',
  'text/json',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'text/plain',
]);

const MAX_INLINE_TEXT_CHARS = 40_000;

function fenceForDoc(doc: ChatDocAttachment): string {
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? '';
  if (doc.mediaType === 'application/json' || ext === 'json') return 'json';
  if (doc.mediaType === 'text/markdown' || ext === 'md' || ext === 'markdown') return 'markdown';
  if (doc.mediaType === 'text/csv' || ext === 'csv') return 'csv';
  return '';
}

function truncateInlineText(raw: string): string {
  if (raw.length <= MAX_INLINE_TEXT_CHARS) return raw;
  return `${raw.slice(0, MAX_INLINE_TEXT_CHARS)}\n…[file text truncated]`;
}

function isZipMediaType(mediaType: string): boolean {
  return ZIP_MEDIA_TYPES.has(mediaType.trim().toLowerCase());
}

function isInlineTextDoc(doc: ChatDocAttachment): boolean {
  if (TEXT_LIKE_DOC_TYPES.has(doc.mediaType)) {
    if (doc.mediaType === 'text/plain') {
      const ext = doc.filename.split('.').pop()?.toLowerCase() ?? '';
      return ext === 'md' || ext === 'markdown' || ext === 'json' || ext === 'txt' || ext === 'csv';
    }
    return true;
  }
  const ext = doc.filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'json' || ext === 'md' || ext === 'markdown' || ext === 'csv';
}

/** Turn a non-PDF chat doc into model-facing text (PPTX / JSON / Markdown / ZIP). */
export async function chatDocToAgentText(doc: ChatDocAttachment): Promise<string> {
  const label = labelForDocMediaType(doc.mediaType);

  if (doc.mediaType === PPTX_MEDIA_TYPE) {
    try {
      const extracted = await extractPptxText(Buffer.from(doc.data, 'base64'));
      return `Attached ${label} "${doc.filename}" (${extracted.slideCount} slide${extracted.slideCount === 1 ? '' : 's'}) — extracted text:\n${extracted.text || '(no text found)'}`;
    } catch (err) {
      console.error('[chatDocAttachments] PPTX text extraction failed', err);
      return `Attached ${label} "${doc.filename}" — could not extract its text (${err instanceof Error ? err.message : 'unknown error'}).`;
    }
  }

  if (isZipMediaType(doc.mediaType)) {
    try {
      const extracted = await extractZipTextFiles(Buffer.from(doc.data, 'base64'));
      return `Attached ZIP "${doc.filename}" (${extracted.fileCount} text file${extracted.fileCount === 1 ? '' : 's'} extracted):\n${extracted.text}`;
    } catch (err) {
      console.error('[chatDocAttachments] ZIP text extraction failed', err);
      return `Attached ZIP "${doc.filename}" — could not read its contents (${err instanceof Error ? err.message : 'unknown error'}).`;
    }
  }

  if (isInlineTextDoc(doc)) {
    const raw = truncateInlineText(Buffer.from(doc.data, 'base64').toString('utf8'));
    const fence = fenceForDoc(doc);
    if (fence) {
      return `Attached ${label} "${doc.filename}":\n\`\`\`${fence}\n${raw}\n\`\`\``;
    }
    return `Attached ${label} "${doc.filename}":\n\`\`\`\n${raw}\n\`\`\``;
  }

  return `Attached file "${doc.filename}" (${doc.mediaType}) — unsupported type for inline preview.`;
}
