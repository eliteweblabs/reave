/**
 * Public marketing-site "speed dial" help assistant — the same floating chat
 * pattern as the client portal (`portalAssistant.ts`), but scoped to general
 * questions from inner marketing pages (features, pricing, booking). The
 * homepage does not mount this widget.
 *
 * No tools, no client data, no destructive actions.
 */
import { serverEnv } from './serverEnv';
import { resolveAgentModel } from './agentModel';
import { anthropicApiHeaders } from './anthropicMessages';
import { isSleepModeActive } from './pushQuietHours';
import { formatMarketingCapabilityCatalog } from './featureCatalog';

export function isSiteAssistantConfigured(): boolean {
  return Boolean(serverEnv('ANTHROPIC_API_KEY')?.trim());
}

export type SiteAssistantTurn = { role: 'user' | 'assistant'; content: string };

export type SiteAssistantPageContext = {
  path: string;
  /** Short label for the page (e.g. "Optional modules"). */
  label: string;
  /** What the visitor is looking at — used in the system prompt. */
  topic: string;
  /** Opening bubble when the chat is empty. */
  greeting: string;
};

export type SiteAssistantContext = {
  brand: {
    name: string;
    description: string;
    supportEmail: string;
    supportPhone: string;
    domain: string;
    siteUrl: string;
  };
  /** Current marketing page, when known — keeps replies grounded in what the visitor is viewing. */
  page?: SiteAssistantPageContext | null;
};

const DEFAULT_GREETING = 'Hi. What can I assist you with today?';

/** Known public pages the site chat should acknowledge by name. */
const SITE_ASSISTANT_PAGES: Record<string, Omit<SiteAssistantPageContext, 'path'>> = {
  '/': {
    label: 'Homepage',
    topic: 'the homepage overview of the company and platform',
    greeting: DEFAULT_GREETING,
  },
  '/features': {
    label: 'Features',
    topic: 'the full platform feature tour',
    greeting: 'Hi. Do you have any questions about these features?',
  },
  '/modules': {
    label: 'Optional modules',
    topic: 'additional / optional industry add-on modules',
    greeting: 'Hi. Do you have any questions about additional modules?',
  },
  '/pricing': {
    label: 'Pricing',
    topic: 'installation tiers and pricing',
    greeting: 'Hi. Do you have any questions about pricing?',
  },
  '/hosting': {
    label: 'Hosting',
    topic: 'managed hosting Core OS and Growth plans',
    greeting: 'Hi. Do you have any questions about hosting?',
  },
  '/about': {
    label: 'About',
    topic: 'the team and company story',
    greeting: 'Hi. Do you have any questions about us?',
  },
  '/platform': {
    label: 'Platform',
    topic: 'the tech stack and how the platform is deployed',
    greeting: 'Hi. Do you have any questions about the platform?',
  },
  '/demo': {
    label: 'Demo hub',
    topic: 'demo options for trying the platform',
    greeting: 'Hi. Do you have any questions about the demos?',
  },
  '/demo-loader': {
    label: 'Demo builder',
    topic: 'building and launching a live demo (including optional modules)',
    greeting: 'Hi. Do you have any questions about building a demo?',
  },
  '/deploy': {
    label: 'Deploy wizard',
    topic: 'standing up a new Railway install with module toggles and reference variables',
    greeting: 'Hi. This page is for wiring a new install — I can explain the steps, but I cannot apply variables from this chat.',
  },
  '/schedule': {
    label: 'Schedule',
    topic: 'booking a call with the team',
    greeting: 'Hi. Need help booking a call?',
  },
  '/digital-audit': {
    label: 'Digital audit',
    topic: 'the digital audit offering',
    greeting: 'Hi. Do you have any questions about the digital audit?',
  },
};

export function normalizeSiteAssistantPagePath(pathname: string | null | undefined): string {
  if (!pathname || typeof pathname !== 'string') return '';
  const raw = pathname.trim();
  if (!raw.startsWith('/')) return '';
  // Reject absolute URLs / protocol-relative paths slipped into the body.
  if (raw.includes('://') || raw.startsWith('//')) return '';
  const noHash = raw.split('#')[0] ?? raw;
  const noQuery = noHash.split('?')[0] ?? noHash;
  const collapsed = noQuery.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.replace(/\/$/, '') || '/';
  // Keep path short and path-only (no weird control chars).
  if (trimmed.length > 120 || /[^\w\-./]/.test(trimmed)) return '';
  return trimmed;
}

export function getSiteAssistantPageContext(
  pathname: string | null | undefined,
): SiteAssistantPageContext | null {
  const path = normalizeSiteAssistantPagePath(pathname);
  if (!path) return null;
  const meta = SITE_ASSISTANT_PAGES[path];
  if (!meta) {
    return {
      path,
      label: path,
      topic: `the ${path} page`,
      greeting: DEFAULT_GREETING,
    };
  }
  return { path, ...meta };
}

export function siteAssistantGreetingForPath(pathname: string | null | undefined): string {
  return getSiteAssistantPageContext(pathname)?.greeting ?? DEFAULT_GREETING;
}

const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 1_024;

function buildSystemPrompt(ctx: SiteAssistantContext): string {
  const { brand, page } = ctx;
  const contactBits = [
    brand.supportPhone ? `call or text ${brand.supportPhone}` : '',
    brand.supportEmail ? `email ${brand.supportEmail}` : '',
  ].filter(Boolean);

  const lines: string[] = [
    `You are the help assistant on ${brand.name}'s public website — a floating chat button on marketing pages. You are chatting with a visitor or prospect, not with staff.`,
    brand.description
      ? `${brand.name}: ${brand.description}`
      : `You represent ${brand.name}.`,
    'Your job: quickly answer questions about what the company does, how the platform works, pricing/install tiers (point them to /pricing for specifics), managed hosting Core OS and Growth plans (point them to /hosting), booking a call, and how to get in touch. Be warm, brief, and non-technical unless they ask for detail.',
    formatMarketingCapabilityCatalog(),
    'Never tell a visitor the platform lacks a named integration that is in the catalog above (Clerk, Vapi, Telnyx, Railway, GitHub, Resend, Crater, Cal.com, Cloudflare, Kinsta, Pexels, CardDAV, and the modules listed). If you are unsure, send them to /features — do not guess "we don\'t have that." A question about whether this chat can take an action (book, send, change) is different: you cannot take actions.',
    'You have NO tools and cannot take any action — you cannot book a meeting, send an email, or change anything. Never claim to have done something you have not. If they want a human, quote, demo, or custom project, tell them how to reach the team (see contact info below) or suggest the contact form, schedule page, or /demo-loader.',
    'Scope: stay focused on this business, its services, and its platform capabilities. A brief friendly reply to something harmless but unrelated is fine, but steer back to how you can help. Never discuss other clients, internal operations, or confidential details.',
    'Useful public pages when relevant: /demo-loader (build and launch a live demo), /about (team and story), /platform (tech stack and deployment), /features (full platform feature tour), /pricing (installation tiers), /hosting (managed WordPress & web-app hosting Core OS and Growth plans from $600/year), /modules (optional industry add-ons), /demo (demo hub), /schedule (book a call), /#contact (contact section on homepage).',
  ];

  if (page) {
    lines.push(
      `The visitor is currently on ${page.path} (${page.label}) — they are looking at ${page.topic}. Prefer answering in that context first. The chat greeting already referenced this page; do not awkwardly re-ask the same question, but do treat follow-ups as about this page unless they clearly change topics.`,
    );
  }

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
