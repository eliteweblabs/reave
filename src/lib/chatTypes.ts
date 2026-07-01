export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ChatImageAttachment {
  mediaType: ChatImageMediaType;
  /** Base64 payload without a data: URL prefix. */
  data: string;
}

export interface ParsedChatContent {
  text: string;
  images: ChatImageAttachment[];
}

const CHAT_CONTENT_JSON_V = 1;
const CHAT_IMAGE_MEDIA_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export interface LinkedJobRef {
  slug: string;
  title: string;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  archived?: boolean;
  source_email_id?: string | null;
  linked_jobs?: LinkedJobRef[];
}

export interface ChatMessage {
  id: string;
  role: ChatTurn['role'];
  content: string;
  created_at: string;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatMessage[];
}

export function parseChatMessageContent(content: string): ParsedChatContent {
  if (!content.startsWith('{"v":')) {
    return { text: content, images: [] };
  }
  try {
    const parsed = JSON.parse(content) as {
      v?: number;
      text?: unknown;
      images?: unknown;
    };
    if (parsed.v !== CHAT_CONTENT_JSON_V) {
      return { text: content, images: [] };
    }
    const images: ChatImageAttachment[] = [];
    if (Array.isArray(parsed.images)) {
      for (const item of parsed.images) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const mediaType = String(rec.mediaType ?? rec.media_type ?? '').toLowerCase();
        const data = String(rec.data ?? '').replace(/^data:[^;]+;base64,/, '');
        if (!CHAT_IMAGE_MEDIA_TYPES.has(mediaType) || !data) continue;
        images.push({ mediaType: mediaType as ChatImageMediaType, data });
      }
    }
    return { text: String(parsed.text ?? ''), images };
  } catch {
    return { text: content, images: [] };
  }
}

export function serializeChatMessageContent(
  text: string,
  images: ChatImageAttachment[] = []
): string {
  if (!images.length) return text;
  return JSON.stringify({ v: CHAT_CONTENT_JSON_V, text, images });
}

export function chatMessagePlainText(content: string): string {
  const { text, images } = parseChatMessageContent(content);
  if (images.length && !text.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && text.trim()) {
    return `${text}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return text;
}

export function titleFromMessage(text: string, imageCount = 0): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine) return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
  if (imageCount > 0) return imageCount === 1 ? 'Image' : `${imageCount} images`;
  return 'New chat';
}
