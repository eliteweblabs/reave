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

export function getButtonProps(response: ChatButtonResponse) {
  return {
    label: response.label,
    href: response.href,
    variant: response.variant || 'primary',
    size: response.size || 'md',
    target: response.target || '_blank',
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

export function parseAssistantChatButtons(text: string): {
  text: string;
  buttons: ChatButtonResponse[];
} {
  const structured = extractStructuredResponses(text);
  const buttons = structured.filter(isButtonResponse);
  return {
    text: stripStructuredJsonBlocks(text),
    buttons,
  };
}
