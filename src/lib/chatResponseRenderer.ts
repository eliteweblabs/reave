/**
 * Parse structured button blocks embedded in assistant chat messages.
 *
 * Agents can append:
 * ```json
 * { "type": "button", "label": "Open project", "href": "https://…" }
 * ```
 */

export type ChatButtonResponse = {
  type: 'button';
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  target?: '_blank' | '_self';
};

export type ChatActionResponse = {
  type: 'action';
  action: string;
  params?: Record<string, unknown>;
};

export type StructuredChatResponse = ChatButtonResponse | ChatActionResponse | Record<string, unknown>;

const JSON_BLOCK_RE = /```json\n?([\s\S]*?)\n?```/g;

export function extractStructuredResponses(text: string): StructuredChatResponse[] {
  const responses: StructuredChatResponse[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(JSON_BLOCK_RE.source, JSON_BLOCK_RE.flags);
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as StructuredChatResponse | StructuredChatResponse[];
      if (Array.isArray(parsed)) responses.push(...parsed);
      else responses.push(parsed);
    } catch {
      /* skip invalid JSON */
    }
  }
  return responses;
}

export function isButtonResponse(data: unknown): data is ChatButtonResponse {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as ChatButtonResponse).type === 'button' &&
    typeof (data as ChatButtonResponse).label === 'string' &&
    typeof (data as ChatButtonResponse).href === 'string'
  );
}

export type ChatButtonNavKind = 'external' | 'admin' | 'portal';

const DEFAULT_CHAT_LINK_ORIGIN = 'https://reave.local';

/** Classify agent chat button hrefs for in-app vs portal navigation. */
export function classifyChatButtonHref(
  href: string,
  origin = DEFAULT_CHAT_LINK_ORIGIN,
): { kind: ChatButtonNavKind; url: URL | null } {
  const trimmed = href.trim();
  if (!trimmed) return { kind: 'external', url: null };
  try {
    const url = new URL(trimmed, origin);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/admin' || path.startsWith('/admin/')) return { kind: 'admin', url };
    if (path.startsWith('/c/')) return { kind: 'portal', url };
    return { kind: 'external', url };
  } catch {
    return { kind: 'external', url: null };
  }
}

declare global {
  interface Window {
    __reaveOpenDeepLink?: (url: string) => void;
  }
}

/** Route structured chat buttons without breaking out of the admin PWA incorrectly. */
export function openChatButtonHref(href: string): boolean {
  if (typeof window === 'undefined') return false;
  const { kind, url } = classifyChatButtonHref(href, window.location.origin);
  if (!url) return false;

  if (kind === 'admin') {
    const deepLink = `${url.pathname}${url.search}${url.hash}`;
    if (window.__reaveOpenDeepLink) {
      window.__reaveOpenDeepLink(deepLink);
      return true;
    }
    window.location.assign(url.href);
    return true;
  }

  if (kind === 'portal') {
    // Admin PWA scope is /admin — portal lives at /c/:uid and must load in a full navigation.
    window.location.assign(url.href);
    return true;
  }

  return false;
}

export function getButtonProps(response: ChatButtonResponse) {
  const { kind } = classifyChatButtonHref(response.href);
  const internal = kind === 'admin' || kind === 'portal';
  return {
    label: response.label,
    href: response.href,
    variant: response.variant || 'primary',
    size: response.size || 'md',
    target: response.target || (internal ? '_self' : '_blank'),
  } as const;
}

export function stripStructuredJsonBlocks(text: string): string {
  return text.replace(JSON_BLOCK_RE, '').trim();
}

/** Helper for agents formatting a button block in plain text responses. */
export function renderButton(
  label: string,
  href: string,
  variant: ChatButtonResponse['variant'] = 'primary',
): string {
  return `\`\`\`json\n${JSON.stringify({ type: 'button', label, href, variant })}\n\`\`\``;
}

/** True when a structured button just re-opens admin chat — useless inside chat. */
export function isRedundantInChatButton(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed, 'https://reave.local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/admin') return false;

    const tab = url.searchParams.get('tab')?.toLowerCase();
    if (tab === 'chats' || tab === 'chat' || tab === '__chat__') return true;
    if (url.searchParams.has('chat')) return true;
    return false;
  } catch {
    return /\/admin\b.*(?:tab=chats?\b|[?&]chat=)/i.test(trimmed);
  }
}

export function parseAssistantChatButtons(text: string): {
  text: string;
  buttons: ChatButtonResponse[];
} {
  const structured = extractStructuredResponses(text);
  const buttons = structured.filter(
    (item): item is ChatButtonResponse =>
      isButtonResponse(item) && !isRedundantInChatButton(item.href),
  );
  return {
    text: stripStructuredJsonBlocks(text),
    buttons,
  };
}
