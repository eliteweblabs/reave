/**
 * Client portal "speed dial" help assistant — a small, scoped-down chat that
 * answers the everyday questions clients otherwise call/email about
 * ("I can't get into my Gmail", "what's my login", "what do I owe").
 *
 * Deliberately NOT the admin agent (`agentRunner.ts`): no tools, no other
 * clients' data, no destructive actions. It only ever sees the single
 * contact's own portal content (already visible to anyone holding that
 * client's unguessable /c/<uid> link) plus general troubleshooting knowledge
 * built into the model.
 */
import { serverEnv } from './serverEnv';
import { resolveAgentModel } from './agentModel';
import { anthropicApiHeaders } from './anthropicMessages';
import { isSleepModeActive } from './pushQuietHours';
import type { ClientDataEntry, ClientPortalField } from './contactApi';

export function isPortalAssistantConfigured(): boolean {
  return Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim());
}

export type PortalAssistantTurn = { role: 'user' | 'assistant'; content: string };

export type PortalAssistantJobSummary = {
  title: string;
  statusLabel: string;
  updated?: string;
};

export type PortalAssistantBilling = {
  totalDue: number;
  outstandingCount: number;
};

export type PortalAssistantContext = {
  clientName: string;
  company: string;
  brand: {
    name: string;
    supportEmail: string;
    supportPhone: string;
    domain: string;
  };
  portal: {
    headline?: string;
    body?: string;
    fields: ClientPortalField[];
    data: ClientDataEntry[];
  };
  billing?: PortalAssistantBilling | null;
  jobs?: PortalAssistantJobSummary[];
};

const MAX_CONTEXT_LIST_ITEMS = 40;

function buildSystemPrompt(ctx: PortalAssistantContext): string {
  const clientLabel = ctx.company && ctx.company !== ctx.clientName
    ? `${ctx.clientName} (${ctx.company})`
    : ctx.clientName;

  const lines: string[] = [
    `You are the help assistant embedded in ${ctx.brand.name}'s client portal — a floating chat button on the client's private portal page. You are chatting directly with the CLIENT, ${clientLabel}, not with staff. Only they have this page's link.`,
    `Your job: quickly answer the small everyday questions a client would otherwise have to call or email about — "I can't get into my Gmail", "what's my login for X", "what do I owe", "what's the status of my project", basic account/website/email troubleshooting, and similar. Be warm, brief, and non-technical. Prefer a short paragraph or a few numbered steps over long essays.`,
    'You have NO tools and cannot take any action — you cannot reset a password, send an email, change billing, or edit anything. Never claim to have done something you have not. If real action is needed, tell the client to reach staff (see contact info below) or point them to the right button/tab on this same page.',
    "Scope: stay focused on this client's own account/login/project/billing questions and general practical troubleshooting (their website, email, hosting, wifi, common consumer apps/services like Gmail, Outlook, Google, Microsoft 365, Facebook, Instagram, GoDaddy, WordPress, etc.). A brief friendly reply to something harmless but unrelated is fine, but steer back to how you can help with their account or project. Never discuss other clients, internal business operations, pricing strategy, or anything outside this scope — you only know about THIS client.",
  ];

  const dataEntries = (ctx.portal.data ?? []).slice(0, MAX_CONTEXT_LIST_ITEMS);
  if (dataEntries.length) {
    lines.push(
      "Saved account/login info on file for this client (from the Vault tab on this same page):",
    );
    for (const e of dataEntries) {
      const bits = [`• ${e.label}`];
      if (e.url) bits.push(`data: ${e.url}`);
      if (e.username) bits.push(`username: ${e.username}`);
      if (e.value) bits.push(`notes: ${e.value}`);
      lines.push(bits.join(' | '));
    }
    lines.push(
      'When asked about a specific account, match by label or data field and share the username and link if available. For passwords, always direct the client to open the Vault tab on this page and tap the reveal icon — never disclose passwords in chat. If nothing matches, say plainly it is not on file.',
    );
  } else {
    lines.push(
      'No saved account/login info is on file for this client yet (their Vault tab is empty). If they ask "what\'s my login" for something specific, say it is not on file, then help with general self-service recovery steps for that kind of account if you can (e.g. standard Google/Microsoft/Facebook account-recovery flow), and offer to have staff look into it.',
    );
  }

  const fields = (ctx.portal.fields ?? []).slice(0, MAX_CONTEXT_LIST_ITEMS);
  if (fields.length) {
    lines.push('Other details on file for this client (Overview tab):');
    for (const f of fields) lines.push(`• ${f.label}: ${f.value}`);
  }
  const overviewNote = [ctx.portal.headline, ctx.portal.body].filter((v) => v?.trim()).join(' — ');
  if (overviewNote) lines.push(`Note staff left on their Overview tab: ${overviewNote}`);

  if (ctx.jobs?.length) {
    lines.push('Projects for this client (archived ones stay visible, flagged, and closed on the Projects tab):');
    for (const j of ctx.jobs.slice(0, MAX_CONTEXT_LIST_ITEMS)) {
      lines.push(`• ${j.title}: ${j.statusLabel}${j.updated ? ` (updated ${j.updated})` : ''}`);
    }
    lines.push('For more detail than a status label, point them to the Projects tab on this page.');
  }

  if (ctx.billing) {
    lines.push(
      ctx.billing.totalDue > 0
        ? `Billing snapshot: $${ctx.billing.totalDue.toFixed(2)} due across ${ctx.billing.outstandingCount} outstanding invoice${ctx.billing.outstandingCount === 1 ? '' : 's'}. Full invoice detail and Pay links live in the Billing tab on this page — confirm the total above, but send them there for specifics or to pay.`
        : 'Billing snapshot: nothing outstanding right now.',
    );
  }

  const contactBits = [
    ctx.brand.supportPhone ? `call or text ${ctx.brand.supportPhone}` : '',
    ctx.brand.supportEmail ? `email ${ctx.brand.supportEmail}` : '',
  ].filter(Boolean);
  lines.push(
    contactBits.length
      ? `If you can't resolve something, or the client just wants a human, tell them to ${contactBits.join(' or ')} — that reaches ${ctx.brand.name} directly.`
      : `If you can't resolve something, tell the client to reach out to ${ctx.brand.name} directly.`,
  );

  lines.push(
    'Formatting: plain text only, no markdown tables, no headers, minimal markdown (light **bold** on a key term is fine). Keep replies under ~150 words unless the client explicitly asks for a detailed step-by-step walkthrough.',
  );

  return lines.join('\n\n');
}

const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 1_024;

function trimHistory(history: PortalAssistantTurn[]): PortalAssistantTurn[] {
  const trimmed = history
    .filter((t) => t.content.trim())
    .map((t) => ({
      role: t.role,
      content: t.content.length > MAX_TURN_CHARS ? `${t.content.slice(0, MAX_TURN_CHARS)}…` : t.content,
    }));
  return trimmed.length > MAX_HISTORY_TURNS ? trimmed.slice(-MAX_HISTORY_TURNS) : trimmed;
}

export async function runPortalAssistantReply(opts: {
  context: PortalAssistantContext;
  message: string;
  history?: PortalAssistantTurn[];
  signal?: AbortSignal;
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) return { ok: false, error: 'Assistant is not configured.' };
  if (await isSleepModeActive()) {
    return {
      ok: false,
      error: 'Our help assistant is offline overnight. Please email or call during business hours.',
    };
  }

  const model = await resolveAgentModel(null, { userText: opts.message });
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
