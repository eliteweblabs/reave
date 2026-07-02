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
  if (images.length && !text.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && text.trim()) {
    return `${text}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return text;
}

export function serializeStoredChatContent(text: string, images: StoredChatImage[]): string {
  if (!images.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
  });
}
