/** Shared chat document MIME types — safe for browser + server (no Node-only deps). */

export const PPTX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const ZIP_MEDIA_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);

export const CHAT_DOC_ACCEPT = [
  'application/pdf',
  PPTX_MEDIA_TYPE,
  'application/json',
  'text/markdown',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  '.pdf',
  '.pptx',
  '.json',
  '.md',
  '.markdown',
  '.csv',
  '.zip',
].join(',');

/** Normalize browser `File.type` + name to a stored chat doc media type. */
export function normalizeChatDocMediaType(type: string, filename: string): string {
  const lowered = (type || '').toLowerCase();
  if (
    lowered === 'application/pdf' ||
    lowered === PPTX_MEDIA_TYPE ||
    lowered === 'application/json' ||
    lowered === 'text/json' ||
    lowered === 'text/markdown' ||
    lowered === 'text/x-markdown' ||
    lowered === 'text/csv' ||
    lowered === 'application/csv' ||
    ZIP_MEDIA_TYPES.has(lowered)
  ) {
    if (lowered === 'text/json') return 'application/json';
    if (lowered === 'application/csv') return 'text/csv';
    return lowered;
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'pptx') return PPTX_MEDIA_TYPE;
  if (ext === 'json') return 'application/json';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'zip') return 'application/zip';

  if (!lowered || lowered === 'application/octet-stream') {
    if (ext === 'json') return 'application/json';
    if (ext === 'md' || ext === 'markdown') return 'text/markdown';
    if (ext === 'csv') return 'text/csv';
    if (ext === 'zip') return 'application/zip';
  }

  return lowered || 'application/octet-stream';
}
