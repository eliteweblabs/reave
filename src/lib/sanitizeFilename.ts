/** Strip control chars and quotes from filenames used in Content-Disposition headers. */
export function sanitizeContentDispositionFilename(filename: string): string {
  const trimmed = filename.trim();
  const withoutControls = trimmed.replace(/[\x00-\x1f\x7f]/g, '');
  return withoutControls.replace(/"/g, '') || 'download';
}
