/** Project file ids are UUID v4 values from randomUUID(). Reject path segments. */
export const PROJECT_FILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeProjectFileId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return false;
  }
  return PROJECT_FILE_ID_RE.test(trimmed);
}
