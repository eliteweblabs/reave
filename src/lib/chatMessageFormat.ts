export type StoredChatImage = { mediaType: string; data: string };

export function parseStoredChatContent(content: string): { text: string; images: StoredChatImage[] } {
  if (typeof content !== 'string' || !content.startsWith('{"v":')) {
    return { text: content || '', images: [] };
  }
  try {
    const parsed = JSON.parse(content) as {
      v?: number;
      text?: string;
      images?: StoredChatImage[];
    };
    if (parsed?.v === 1) {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((img) => img?.mediaType && img?.data)
        : [];
      return { text: String(parsed.text ?? ''), images };
    }
  } catch {
    /* fall through */
  }
  return { text: content, images: [] };
}

export function storedChatPlainText(content: string): string {
  const { text, images } = parseStoredChatContent(content);
  const displayText = userMessageDisplayText(text);
  if (images.length && !displayText.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && displayText.trim()) {
    return `${displayText}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return displayText;
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

export function serializeStoredChatContent(text: string, images: StoredChatImage[]): string {
  if (!images.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
  });
}
