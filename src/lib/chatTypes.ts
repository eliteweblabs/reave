import type { AgentUsageSummary } from './agentUsage';

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  agent_usage?: AgentUsageSummary | null;
};

export type ChatImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'image/svg+xml';

export interface ChatImageAttachment {
  mediaType: ChatImageMediaType;
  /** Base64 payload without a data: URL prefix. For SVG, this is the raw XML source, base64-encoded. */
  data: string;
}

/** Non-image documents the agent can read (PDF: native vision+text; PPTX: extracted slide text). */
export type ChatDocMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface ChatDocAttachment {
  mediaType: ChatDocMediaType;
  filename: string;
  /** Base64 payload without a data: URL prefix. */
  data: string;
}

export interface ParsedChatContent {
  text: string;
  images: ChatImageAttachment[];
  docs: ChatDocAttachment[];
}

const CHAT_CONTENT_JSON_V = 1;
const CHAT_IMAGE_MEDIA_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);
const CHAT_DOC_MEDIA_TYPES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const DOC_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint file',
};

export function labelForDocMediaType(mediaType: string): string {
  return DOC_LABELS[mediaType] ?? 'file';
}

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
  /** Client referenced via linked project or source email, when known. */
  contact_uid?: string | null;
  /** Client portal icon URL for sidebar display; null when no contact is linked. */
  author_icon_url?: string | null;
  /** Role of the most recent message, if any — drives the sidebar "unread" dot. */
  last_role?: ChatTurn['role'] | null;
  /**
   * Server-side "I have seen the latest message" timestamp, shared across every
   * device signed in as this user. Compared against `updated_at` to decide the
   * unread dot, so opening a thread on one device also clears it everywhere else.
   */
  last_seen_at?: string | null;
}

export interface ChatMessage {
  id: string;
  role: ChatTurn['role'];
  content: string;
  created_at: string;
  agent_usage?: AgentUsageSummary | null;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatMessage[];
}

export function parseChatMessageContent(content: string): ParsedChatContent {
  if (!content.startsWith('{"v":')) {
    return { text: content, images: [], docs: [] };
  }
  try {
    const parsed = JSON.parse(content) as {
      v?: number;
      text?: unknown;
      images?: unknown;
      docs?: unknown;
    };
    if (parsed.v !== CHAT_CONTENT_JSON_V) {
      return { text: content, images: [], docs: [] };
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
    const docs: ChatDocAttachment[] = [];
    if (Array.isArray(parsed.docs)) {
      for (const item of parsed.docs) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const mediaType = String(rec.mediaType ?? rec.media_type ?? '').toLowerCase();
        const data = String(rec.data ?? '').replace(/^data:[^;]+;base64,/, '');
        const filename = String(rec.filename ?? '').trim();
        if (!CHAT_DOC_MEDIA_TYPES.has(mediaType) || !data) continue;
        docs.push({ mediaType: mediaType as ChatDocMediaType, filename: filename || 'attachment', data });
      }
    }
    return { text: String(parsed.text ?? ''), images, docs };
  } catch {
    return { text: content, images: [], docs: [] };
  }
}

export function serializeChatMessageContent(
  text: string,
  images: ChatImageAttachment[] = [],
  docs: ChatDocAttachment[] = []
): string {
  if (!images.length && !docs.length) return text;
  return JSON.stringify({ v: CHAT_CONTENT_JSON_V, text, images, docs });
}

function attachmentSummary(images: ChatImageAttachment[], docs: ChatDocAttachment[]): string | null {
  const parts: string[] = [];
  const svgCount = images.filter((img) => img.mediaType === 'image/svg+xml').length;
  const imageCount = images.length - svgCount;
  if (imageCount > 0) parts.push(imageCount === 1 ? 'image' : `${imageCount} images`);
  if (svgCount > 0) parts.push(svgCount === 1 ? 'SVG' : `${svgCount} SVGs`);
  for (const doc of docs) parts.push(labelForDocMediaType(doc.mediaType));
  if (!parts.length) return null;
  return parts.join(', ');
}

export function chatMessagePlainText(content: string): string {
  const { text, images, docs } = parseChatMessageContent(content);
  const summary = attachmentSummary(images, docs);
  if (!summary) return text;
  if (!text.trim()) return `[${summary}]`;
  return `${text}\n[${summary} attached]`;
}

export const DEFAULT_CHAT_TITLE = 'New session';
const LEGACY_DEFAULT_CHAT_TITLE = 'New chat';

/** ~two lines in the chat sidebar list at 0.82rem / 1.35 line-height. */
export const MAX_CHAT_TITLE_LENGTH = 120;

/** Max messages returned to the admin UI — full history stays in Postgres for the agent. */
export const CHAT_UI_MESSAGE_CAP = 48;

export function isDefaultChatTitle(title: string): boolean {
  const t = title.trim();
  return t === DEFAULT_CHAT_TITLE || t === LEGACY_DEFAULT_CHAT_TITLE;
}

/** Collapse whitespace and cap stored/display titles at MAX_CHAT_TITLE_LENGTH. */
export function truncateChatTitle(title: string): string {
  const oneLine = title.replace(/\s+/g, ' ').trim();
  if (!oneLine || oneLine.length <= MAX_CHAT_TITLE_LENGTH) return oneLine;
  return `${oneLine.slice(0, MAX_CHAT_TITLE_LENGTH - 1)}…`;
}

export function titleFromMessage(text: string, imageCount = 0, docCount = 0): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine) return truncateChatTitle(oneLine);
  const attachmentCount = imageCount + docCount;
  if (attachmentCount === 1) return docCount === 1 ? 'File' : 'Image';
  if (attachmentCount > 1) return `${attachmentCount} attachments`;
  return DEFAULT_CHAT_TITLE;
}

/** Derive a display title from thread messages when the thread still has the default title. */
export function deriveChatTitleFromThread(thread: ChatThreadDetail): string | null {
  if (!isDefaultChatTitle(thread.title) || !thread.messages.length) return null;

  for (const role of ['user', 'assistant'] as const) {
    const msg = thread.messages.find((m) => m.role === role);
    if (!msg) continue;
    const { text, images, docs } = parseChatMessageContent(msg.content);
    const title = titleFromMessage(text, images.length, docs.length);
    if (!isDefaultChatTitle(title)) return title;
  }

  return null;
}
