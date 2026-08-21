/**
 * One-shot agent drafts for email compose/reply and social posts/replies.
 * Does not send or publish — the human reviews the text in the compose box.
 */
import { resolveAgentModel } from './agentModel.ts';
import {
  createAnthropicMessage,
  formatAnthropicApiError,
  type AnthropicMessagesResponse,
} from './anthropicMessages.ts';

export const COMPOSE_DRAFT_KINDS = ['email', 'social_reply', 'social_post'] as const;
export type ComposeDraftKind = (typeof COMPOSE_DRAFT_KINDS)[number];

export type ComposeDraftIncoming = {
  from?: string;
  subject?: string;
  body?: string;
};

export type ComposeDraftInput = {
  kind: ComposeDraftKind;
  companyName: string;
  to?: string;
  subject?: string;
  currentBody?: string;
  incoming?: ComposeDraftIncoming;
  platform?: string;
  authorName?: string;
  incomingText?: string;
};

export type ComposeDraftResult = {
  subject?: string;
  body: string;
};

export function isComposeDraftKind(value: string): value is ComposeDraftKind {
  return (COMPOSE_DRAFT_KINDS as readonly string[]).includes(value);
}

function textFromAnthropic(data: AnthropicMessagesResponse): string {
  return (data.content ?? [])
    .filter(
      (block): block is { type: 'text'; text: string } =>
        Boolean(block) &&
        typeof block === 'object' &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/** Pull subject/body out of a model reply that may be JSON or plain text. */
export function parseComposeDraftResponse(
  raw: string,
  kind: ComposeDraftKind,
): ComposeDraftResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
      const body = String(parsed.body ?? parsed.text ?? parsed.reply ?? '').trim();
      const subjectRaw = parsed.subject != null ? String(parsed.subject).trim() : '';
      if (body) {
        return kind === 'email' && subjectRaw ? { subject: subjectRaw, body } : { body };
      }
    } catch {
      /* fall through to plain text */
    }
  }

  return { body: trimmed };
}

export function buildComposeDraftPrompt(input: ComposeDraftInput): {
  system: string;
  user: string;
} {
  const company = input.companyName.trim() || 'the company';
  const system = [
    `You write short outbound copy as staff at ${company}.`,
    'Return JSON only — no markdown fences, no commentary.',
    'Never invent facts, prices, legal advice, or promises the user did not give you.',
    'Match a warm, professional tone. First person plural (“we”) unless the thread is clearly one person.',
    'Do not include quoted original messages. The UI keeps those separately.',
  ].join(' ');

  const lines: string[] = [];
  if (input.kind === 'email') {
    lines.push(
      input.incoming?.body
        ? 'Write a reply email. JSON shape: {"subject":"...","body":"..."}.'
        : 'Write a new outbound email. JSON shape: {"subject":"...","body":"..."}.',
    );
    if (input.to) lines.push(`To: ${input.to}`);
    if (input.subject) lines.push(`Current subject: ${input.subject}`);
    if (input.incoming?.from) lines.push(`Incoming from: ${input.incoming.from}`);
    if (input.incoming?.subject) lines.push(`Incoming subject: ${input.incoming.subject}`);
    if (input.incoming?.body) lines.push(`Incoming message:\n${input.incoming.body}`);
    if (input.currentBody) lines.push(`Staff notes / existing draft to honor:\n${input.currentBody}`);
    lines.push('Keep the body under ~180 words. Sign off with the company name only — no invented staff names.');
  } else if (input.kind === 'social_reply') {
    lines.push('Write a public social/review reply. JSON shape: {"body":"..."}.');
    if (input.platform) lines.push(`Network: ${input.platform}`);
    if (input.authorName) lines.push(`They wrote as: ${input.authorName}`);
    if (input.incomingText) lines.push(`Their message:\n${input.incomingText}`);
    if (input.currentBody) lines.push(`Staff notes / existing draft to honor:\n${input.currentBody}`);
    lines.push('Keep it under 80 words. No hashtags unless the draft already uses them. Thank them when it fits.');
  } else {
    lines.push('Write a social post. JSON shape: {"body":"..."}.');
    if (input.platform) lines.push(`Networks: ${input.platform}`);
    if (input.currentBody) lines.push(`Staff notes / existing draft to honor:\n${input.currentBody}`);
    lines.push('Keep it under 60 words. One clear call to action at most. No invented promotions.');
  }

  return { system, user: lines.join('\n\n') };
}

export async function generateComposeDraft(
  input: ComposeDraftInput,
): Promise<{ ok: true; draft: ComposeDraftResult } | { ok: false; error: string }> {
  const { system, user } = buildComposeDraftPrompt(input);
  const model = await resolveAgentModel(null, { userText: user });
  const result = await createAnthropicMessage({
    model,
    max_tokens: 700,
    system,
    messages: [{ role: 'user', content: user }],
  });

  if (!result.ok) {
    if (result.text === 'sleep_mode') {
      return { ok: false, error: 'The agent is in sleep mode. Try again during waking hours.' };
    }
    if (result.status === 0) {
      return { ok: false, error: result.text || 'Agent is not configured.' };
    }
    return { ok: false, error: formatAnthropicApiError(result.status, result.text) };
  }

  const draft = parseComposeDraftResponse(textFromAnthropic(result.data), input.kind);
  if (!draft) return { ok: false, error: 'The agent did not return any copy. Try again.' };
  return { ok: true, draft };
}
