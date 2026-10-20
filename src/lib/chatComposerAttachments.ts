/** Serialize composer attachment adds — parallel adds race in assistant-ui and drop files. */
let attachmentQueue: Promise<void> = Promise.resolve();

export function queueComposerAttachment(
  add: (file: File) => Promise<void>,
  file: File,
): Promise<void> {
  const next = attachmentQueue.then(() => add(file));
  attachmentQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function queueComposerAttachments(
  add: (file: File) => Promise<void>,
  files: Iterable<File>,
): Promise<void> {
  for (const file of files) {
    try {
      await queueComposerAttachment(add, file);
    } catch (error) {
      console.error('Failed to add attachment:', error);
    }
  }
}

const REDUNDANT_IMAGE_ACCEPT =
  /^\.(jpe?g|png|gif|webp)$|^image\/(jpe?g|png|gif|webp|svg\+xml)$/i;

/**
 * iOS Photos multi-select is unreliable when `accept` lists many specific image MIME types.
 * Prefer `image/*` plus non-image types (PDF, pptx) and extension fallbacks.
 */
export function chatFileInputAccept(attachmentAccept: string): string {
  if (!attachmentAccept || attachmentAccept === '*') return attachmentAccept;

  const tokens = attachmentAccept
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const out: string[] = [];
  let wantsImageWildcard = false;

  for (const token of tokens) {
    if (token === 'image/*') {
      wantsImageWildcard = true;
      continue;
    }
    if (REDUNDANT_IMAGE_ACCEPT.test(token)) {
      wantsImageWildcard = true;
      continue;
    }
    if (token === '.svg') {
      wantsImageWildcard = true;
      continue;
    }
    out.push(token);
  }

  if (wantsImageWildcard) {
    out.unshift('image/*', '.svg');
  }

  return [...new Set(out)].join(',');
}
