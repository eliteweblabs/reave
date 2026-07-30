/**
 * Public marketing-site "speed dial" help assistant — the same floating chat
 * pattern as the client portal (`portalAssistant.ts`), but scoped to general
 * questions from homepage and /features visitors (services, pricing, booking).
 *
 * No tools, no client data, no destructive actions.
 */
import { serverEnv } from './serverEnv';
import { resolveAgentModel } from './agentModel';
import { anthropicApiHeaders } from './anthropicMessages';
import { isSleepModeActive } from './pushQuietHours';

export function isSiteAssistantConfigured(): boolean {
  return Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim());
}

export type SiteAssistantTurn = { role: 'user' | 'assistant'; content: string };

export type SiteAssistantContext = {
  brand: {
    name: string;
    description: string;
    supportEmail: string;
    supportPhone: string;
    domain: string;
    siteUrl: string;
  };
};

const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 1_024;

function buildSystemPrompt(ctx: SiteAssistantContext): string {
  const { brand } = ctx;
  const contactBits = [
    brand.supportPhone ? `call or text ${brand.supportPhone}` : '',
    brand.supportEmail ? `email ${brand.supportEmail}` : '',
  ].filter(Boolean);

  const lines: string[] = [
    `You are the help assistant on ${brand.name}'s public website — a floating chat button on the homepage and features page. You are chatting with a visitor or prospect, not with staff.`,
    brand.description
      ? `${brand.name}: ${brand.description}`
      : `You represent ${brand.name}.`,
    'Your job: quickly answer questions about what the company does, how the platform works, pricing/install tiers (point them to /features#plan for specifics), booking a call, and how to get in touch. Be warm, brief, and non-technical unless they ask for detail.',
    'You have NO tools and cannot take any action — you cannot book a meeting, send an email, or change anything. Never claim to have done something you have not. If they want a human, quote, demo, or custom project, tell them how to reach the team (see contact info below) or suggest the contact form, schedule page, or /deck demo.',
    'Scope: stay focused on this business, its services, and its platform capabilities. A brief friendly reply to something harmless but unrelated is fine, but steer back to how you can help. Never discuss other clients, internal operations, or confidential details.',
    'Useful public pages when relevant: /features (full platform tour and installation pricing), /deck (live demo), /schedule (book a call), /#contact (contact section on homepage).',
  ];

  if (contactBits.length) {
    lines.push(
      `If you can't resolve something, or they want to talk to a person, tell them to ${contactBits.join(' or ')} — that reaches ${brand.name} directly.`,
    );
  } else {
    lines.push(`If they want a person, suggest the contact form on the homepage or /schedule.`);
  }

  lines.push(
    'Formatting: plain text only, no markdown tables, no headers, minimal markdown (light **bold** on a key term is fine). Keep replies under ~150 words unless they explicitly ask for a detailed walkthrough.',
  );

  return lines.join('\n\n');
}

function trimHistory(history: SiteAssistantTurn[]): SiteAssistantTurn[] {
  const trimmed = history
    .filter((t) => t.content.trim())
    .map((t) => ({
      role: t.role,
      content: t.content.length > MAX_TURN_CHARS ? `${t.content.slice(0, MAX_TURN_CHARS)}…` : t.content,
    }));
  return trimmed.length > MAX_HISTORY_TURNS ? trimmed.slice(-MAX_HISTORY_TURNS) : trimmed;
}

export async function runSiteAssistantReply(opts: {
  context: SiteAssistantContext;
  message: string;
  history?: SiteAssistantTurn[];
  signal?: AbortSignal;
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) return { ok: false, error: 'Assistant is not configured.' };
  if (await isSleepModeActive()) {
    return {
      ok: false,
      error: 'Our help assistant is offline overnight. Please use the contact form or schedule page, or reach us during business hours.',
    };
  }

  const model = await resolveAgentModel();
  const system = buildSystemPrompt(opts.context);
  const messages = [
    ...trimHistory(opts.history ?? []),
    { role: 'user' as const, content: opts.message },
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicApiHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: `Assistant error (${res.status}): ${text.slice(0, 300)}` };
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const reply = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim();

    return {
      ok: true,
      reply: reply || "Sorry — I didn't quite catch that. Could you rephrase your question?",
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: 'Request cancelled.' };
    return { ok: false, error: e instanceof Error ? e.message : 'Assistant request failed.' };
  }
}
