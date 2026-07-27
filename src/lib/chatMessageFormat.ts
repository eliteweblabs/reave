export type StoredChatImage = { mediaType: string; data: string };
export type StoredChatDoc = { mediaType: string; filename: string; data: string };

const DOC_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint file',
};

function labelForDoc(mediaType: string): string {
  return DOC_LABELS[mediaType] ?? 'file';
}

export function parseStoredChatContent(
  content: string
): { text: string; images: StoredChatImage[]; docs: StoredChatDoc[] } {
  if (typeof content !== 'string' || !content.startsWith('{"v":')) {
    return { text: content || '', images: [], docs: [] };
  }
  try {
    const parsed = JSON.parse(content) as {
      v?: number;
      text?: string;
      images?: StoredChatImage[];
      docs?: StoredChatDoc[];
    };
    if (parsed?.v === 1) {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((img) => img?.mediaType && img?.data)
        : [];
      const docs = Array.isArray(parsed.docs)
        ? parsed.docs.filter((doc) => doc?.mediaType && doc?.data)
        : [];
      return { text: String(parsed.text ?? ''), images, docs };
    }
  } catch {
    /* fall through */
  }
  return { text: content, images: [], docs: [] };
}

export function storedChatPlainText(content: string): string {
  const { text, images, docs } = parseStoredChatContent(content);
  const displayText = userMessageDisplayText(text);
  const parts: string[] = [];
  const svgCount = images.filter((img) => img.mediaType === 'image/svg+xml').length;
  const imageCount = images.length - svgCount;
  if (imageCount > 0) parts.push(imageCount === 1 ? 'image' : `${imageCount} images`);
  if (svgCount > 0) parts.push(svgCount === 1 ? 'SVG' : `${svgCount} SVGs`);
  for (const doc of docs) parts.push(labelForDoc(doc.mediaType));
  if (!parts.length) return displayText;
  const summary = parts.join(', ');
  if (!displayText.trim()) return `[${summary}]`;
  return `${displayText}\n[${summary} attached]`;
}

/** Collapse legacy verbose email dumps to a short reference for chat display. */
export function userMessageDisplayText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const verboseEmail =
    trimmed.includes('[Email triage]') ||
    trimmed.includes('\nHeaders:\n') ||
    (trimmed.includes('Message ID:') && trimmed.includes('\nBody:')) ||
    (trimmed.length > 600 &&
      (trimmed.includes('envelope-from') ||
        trimmed.includes('x-ses-receipt') ||
        trimmed.includes('client-ip=')));

  if (!verboseEmail) return text;

  const from = trimmed.match(/^From:\s*(.+)$/m)?.[1]?.trim();
  const subject = trimmed.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  const received = trimmed.match(/^Received:\s*(.+)$/m)?.[1]?.trim();

  const lines: string[] = [];
  if (from) lines.push(`From: ${from}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (received) lines.push(`Received: ${received}`);

  if (lines.length) {
    lines.push('', 'Please wait for instructions on how to deal with this email.');
    return lines.join('\n');
  }

  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}

export function serializeStoredChatContent(
  text: string,
  images: StoredChatImage[],
  docs: StoredChatDoc[] = []
): string {
  if (!images.length && !docs.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
    docs: docs.map(({ mediaType, filename, data }) => ({ mediaType, filename, data })),
  });
}
