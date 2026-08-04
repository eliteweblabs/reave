/** Strip control chars and quotes from filenames used in Content-Disposition headers. */
export function sanitizeContentDispositionFilename(filename: string): string {
  return filename.replace(/[\x00-\x1f\x7f\r\n"]/g, '').trim() || 'file';
}
