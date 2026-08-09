import { labelForAgentModel, resolveAgentModel } from './agentModel';
import { isBraveConfigured } from './braveClient';
import { isPexelsConfigured } from './pexelsClient';
import { buildTools, runTool } from './agentTools';
import { getCompanyBrandContext } from './companyConfig';
import { isContactApiConfigured, siteBaseUrl } from './contactApi';
import { isMaterialsApiConfigured } from './materialsClient';
import { isCardDavConfigured } from './carddav/auth';
import { isCraterConfigured } from './craterClient';
import { isBookingConfigured } from './bookingClient';
import { isVapiAdminConfigured } from './vapiPlugin';
import { isUptimeRobotConfigured } from './uptimerobotClient';
import { hasFeature } from './features';
import { isGithubConfigured } from './githubClient';
import { prependDeployBanner } from './deployStatus';
import { isDeferredDeployEnabled } from './deferredDeploy';
import { isRailwayConfigured } from './railwayClient';
import { isCloudflareConfigured } from './cloudflareClient';
import { isKinstaConfigured } from './kinstaClient';
import { serverEnv } from './serverEnv';
import type { ChatDocAttachment, ChatImageAttachment } from './chatTypes';
import { parseChatMessageContent, serializeChatMessageContent } from './chatTypes';
import type { ChatTurn } from './chatTypes';
import { formatMentionsContextLine } from './chatMentions';
import { userMessageDisplayText } from './chatMessageFormat';
import { extractPptxText } from './pptxText';
import { rasterizeSvgToPng } from './svgRaster';
import {
  ANTHROPIC_PROMPT_CACHE,
  cachedSystemBlocks,
  createAnthropicMessage,
  formatAnthropicApiError,
  streamAnthropicMessage,
  withToolPromptCaching,
} from './anthropicMessages';
import { runWithAgentContext, getAgentContext, type AgentRunContext } from './agentContext';
import { appendAgentPartialText, setAgentProgress } from './agentProgress';
import { isSleepModeActive, sleepModeBlockMessage, getPushQuietHoursSettings } from './pushQuietHours';
import { throwIfAborted } from './agentRunControl';
import {
  agentLlmTurnTimeoutMs,
  agentToolTimeoutMs,
  canRunToolsConcurrently,
  createAgentDeadline,
  formatSeconds,
  isAgentTimeoutError,
  withDeadline,
  type AgentDeadline,
} from './agentWatchdog';
import { labelForAgentTool } from './agentToolLabels';
import {
  addAnthropicUsage,
  createAgentUsageAccumulator,
  finalizeAgentUsage,
  logAgentUsage,
  type AgentUsageSummary,
} from './agentUsage';
import { storeGetEmailInbox } from './emailInboxStore';
import { formatEmailForAgent } from './emailAgentContext';
import { listJobsForItem } from './projectLinks';
import { storeReadWork } from './workStore';
import { formatWorkForAgent } from './workAgentContext';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

const PPTX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

/** Map the internal (OpenAI-style) tool defs to Anthropic's tools shape. */
function buildAnthropicTools(brand: Awaited<ReturnType<typeof getCompanyBrandContext>>): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return buildTools(brand).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

async function buildUserContentBlocks(
  text: string,
  images: ChatImageAttachment[] = [],
  docs: ChatDocAttachment[] = []
): Promise<string | AnthropicContentBlock[]> {
  if (!images.length && !docs.length) return text;
  const blocks: AnthropicContentBlock[] = [];
  const extraTextParts: string[] = [];

  for (const img of images) {
    if (img.mediaType === 'image/svg+xml') {
      const svgSource = Buffer.from(img.data, 'base64').toString('utf8');
      try {
        const raster = await rasterizeSvgToPng(svgSource);
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: raster.pngBase64 },
        });
      } catch (err) {
        console.error('[agentRunner] SVG rasterization failed', err);
      }
      const truncatedSource =
        svgSource.length > 20_000 ? `${svgSource.slice(0, 20_000)}\n<!-- …truncated… -->` : svgSource;
      extraTextParts.push(`Attached SVG source:\n\`\`\`svg\n${truncatedSource}\n\`\`\``);
      continue;
    }
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    });
  }

  for (const doc of docs) {
    if (doc.mediaType === 'application/pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: doc.data },
      });
      continue;
    }
    if (doc.mediaType === PPTX_MEDIA_TYPE) {
      try {
        const extracted = await extractPptxText(Buffer.from(doc.data, 'base64'));
        extraTextParts.push(
          `Attached PowerPoint file "${doc.filename}" (${extracted.slideCount} slide${extracted.slideCount === 1 ? '' : 's'}) — extracted text:\n${extracted.text || '(no text found)'}`,
        );
      } catch (err) {
        console.error('[agentRunner] PPTX text extraction failed', err);
        extraTextParts.push(
          `Attached PowerPoint file "${doc.filename}" — could not extract its text (${err instanceof Error ? err.message : 'unknown error'}).`,
        );
      }
    }
  }

  const trimmed = text.trim();
  const combinedText = [trimmed, ...extraTextParts].filter(Boolean).join('\n\n');
  blocks.push({
    type: 'text',
    text: combinedText || 'What can you tell me about the attached file(s)?',
  });
  return blocks;
}

async function anthropicContentFromStored(
  content: string,
  role: ChatTurn['role']
): Promise<string | AnthropicContentBlock[]> {
  if (role === 'assistant') return content;
  const { text, images, docs } = parseChatMessageContent(content);
  if (!images.length && !docs.length) return content;
  return buildUserContentBlocks(text, images, docs);
}

/**
 * Returns the current date/time formatted in the owner's configured timezone
 * (from Admin → Settings → Sleep mode → Timezone). Falls back to UTC if the
 * setting cannot be read. The timezone name is appended so the agent knows
 * which zone all times are expressed in.
 */
async function currentDateTimeLine(): Promise<string> {
  let timeZone = 'UTC';
  try {
    const settings = await getPushQuietHoursSettings();
    if (settings.timezone?.trim()) timeZone = settings.timezone.trim();
  } catch {
    // non-fatal — fall back to UTC
  }
  const formatted = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  return `Current date and time: ${formatted} (${timeZone})`;
}

async function runtimeContextLine(model: string): Promise<string> {
  return [
    await currentDateTimeLine(),
    `Runtime model: ${labelForAgentModel(model)} (${model}). If asked which model or version you are, report this exactly — do not guess.`,
  ].join('\n');
}

// serverEnv, not import.meta.env: Vite inlines import.meta.env at build time, so
// reading it here meant Railway-set values were silently ignored and these knobs
// did nothing in production.
function agentHistoryCap(): number | null {
  const raw = serverEnv('AGENT_CHAT_HISTORY_TURNS');
  if (!raw?.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const MAX_TURN_CHARS = 8_000;
const MAX_TOOL_RESULT_CHARS = 50_000;
const MAX_AGENT_TOOL_ROUNDS = 40;
const MAX_SYSTEM_ALERT_TOOL_ROUNDS = 5;

/**
 * Output-token budget per LLM turn. This must be large: when the agent writes a
 * file/page, the whole file body is embedded in the tool-call arguments, which
 * count as OUTPUT tokens. Too small and write_file/write_github_file calls get cut
 * off mid-argument → stop_reason "max_tokens" → the turn ends on the preamble
 * ("Now building the page…") with nothing actually written.
 *
 * 8,192 was still far too small for a real page: a single Astro page with copy
 * runs well past it, so building one could not succeed no matter how many times
 * the model retried. Ask for a lot; anthropicMessages clamps this to whatever the
 * model actually allows (learned from the API), so overshooting is safe.
 * Overridable via AGENT_MAX_OUTPUT_TOKENS.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
/**
 * How many times we re-prompt the model when it stalls (truncated turn or an
 * unfulfilled future-tense promise with no tool call) before giving up. Three,
 * not two: the first nudge often just repeats the same oversized write, and the
 * advice that actually fixes it (split the file, append the rest) needs an
 * attempt of its own to land.
 */
const MAX_STALL_NUDGES = 3;

function agentMaxOutputTokens(): number {
  const raw = serverEnv('AGENT_MAX_OUTPUT_TOKENS');
  if (raw?.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1024) return Math.floor(n);
  }
  return DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Detects the failure the user kept hitting: the model announces an action in
 * future tense ("Let me…", "I'll write…", "Now writing all three pages right
 * now:") but ends its turn without calling any tool, so nothing happens.
 */
function looksLikeUnfulfilledPromise(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const promise =
    /\b(let me\b|i['']?ll\b|i will\b|i['']?m going to\b|i am going to\b|i['']?m about to\b|here['']?s what i['']?ll do|now\s+(i['']?m\s+)?(writing|creating|building|editing|updating|committing|pushing|deploying|sending|generating)\b|going to\s+(write|create|build|edit|update|commit|push|deploy|send|generate)\b)/i;
  if (!promise.test(t)) return false;
  // Real failures are short and/or trail off into a colon ("…right now:"). Long,
  // substantive replies that merely mention "I'll" in passing are left alone.
  return t.length < 600 || /[:：]\s*$/.test(t);
}

/**
 * Build a valid assistant message to re-anchor a stall nudge. We keep only text
 * blocks: a truncated turn can contain a partial tool_use block with no matching
 * tool_result, which the API rejects. Falls back to a placeholder so the
 * assistant message is never empty (also rejected).
 */
function assistantTextMessageFor(
  content: AnthropicContentBlock[],
  fallback: string,
): AnthropicMessage {
  const textBlocks = content.filter(
    (b): b is { type: 'text'; text: string } => b.type === 'text' && !!b.text?.trim(),
  );
  return {
    role: 'assistant',
    content: textBlocks.length ? textBlocks : [{ type: 'text', text: fallback }],
  };
}

/**
 * Name of the tool whose call was still being written when the output budget ran
 * out. A truncated turn carries a partial `tool_use` block: the name arrives
 * early in the stream, the arguments are what got cut off.
 */
function truncatedToolName(content: AnthropicContentBlock[]): string | undefined {
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block.type === 'tool_use' && block.name) return block.name;
  }
  return undefined;
}

const CHUNKED_WRITE_INSTRUCTION =
  'Write it in sections instead: call the tool once with the first part of the file, then call it ' +
  'again with append:true for each following part. Keep each part comfortably under the limit. ' +
  'Do not send the whole file in one call again — it will be cut off the same way.';

/** What we tell the model when a turn stalls, so its next attempt can succeed. */
function stallNudgeText(opts: {
  truncated: boolean;
  blank: boolean;
  cutOffTool?: string;
}): string {
  if (opts.truncated) {
    if (opts.cutOffTool) {
      return (
        `Your ${opts.cutOffTool} call was cut off mid-argument: the content you were sending exceeded ` +
        `the output limit for a single response, so the call never ran and nothing was written. ` +
        CHUNKED_WRITE_INSTRUCTION
      );
    }
    return (
      'Your previous response was cut off before the action completed. Continue now and finish the ' +
      'task by calling the required tools in this turn — do not restate the plan, just execute it. ' +
      'If you were writing a large file, send it in smaller pieces (append:true for later pieces).'
    );
  }
  if (opts.blank) {
    return (
      'Your previous turn produced no text and no tool call, so nothing happened and the user saw no ' +
      "reply. Answer the user's message now, or call the necessary tool(s) if action is required."
    );
  }
  return (
    'You described what you were going to do but did not call any tools, so nothing actually ' +
    'happened. Execute it now by invoking the tools in this same turn. Do not reply with another ' +
    'plan or a future-tense promise ("I\'ll…", "Let me…"). If you genuinely cannot proceed, say ' +
    'exactly why instead.'
  );
}

/** What we tell the user when the model could not be coaxed into finishing. */
function stallExplanation(opts: {
  truncated: boolean;
  blank: boolean;
  unfulfilled: boolean;
  cutOffTool?: string;
}): string {
  if (opts.truncated) {
    const what = opts.cutOffTool ? `my ${opts.cutOffTool} call` : 'my response';
    return (
      `_(I couldn't finish this: ${what} kept exceeding the size limit for a single response, so the ` +
      "write never went through — nothing was saved. Ask me to build it in smaller pieces (one " +
      'section or one file at a time) and it will go through.)_'
    );
  }
  if (opts.unfulfilled) {
    return (
      "_(I said I'd do that but never actually ran the tools, so nothing was created or changed. " +
      'Nothing is half-done. Ask me again — ideally for one concrete step — and I\'ll execute it.)_'
    );
  }
  return (
    '_(I stopped producing output partway through this turn, so nothing was completed. Please ask ' +
    'again.)_'
  );
}

function truncateToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;
  return `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[tool result truncated]`;
}

function agentMaxToolRounds(): number {
  return getAgentContext().systemAlert ? MAX_SYSTEM_ALERT_TOOL_ROUNDS : MAX_AGENT_TOOL_ROUNDS;
}

function turnHasAnthropicContent(turn: ChatTurn): boolean {
  if (turn.role === 'assistant') return !!turn.content.trim();
  const { text, images, docs } = parseChatMessageContent(turn.content);
  return !!userMessageDisplayText(text).trim() || images.length > 0 || docs.length > 0;
}

/**
 * How many *past* user turns are allowed to replay their images/docs in full.
 * Attachments (especially PDFs/PPTX) can be several MB of base64 — resending
 * them on every subsequent turn would blow past Anthropic's 32MB request cap
 * and burn a lot of tokens for little benefit once the conversation has moved
 * on. Older turns keep their text but drop attachments; the *current* turn's
 * own attachments (appended separately below) are never affected by this.
 */
const MAX_HISTORY_ATTACHMENT_TURNS = 2;

function trimTurnsForAgent(turns: ChatTurn[]): ChatTurn[] {
  const keepAttachmentsAt = new Set<number>();
  let attachmentBudget = MAX_HISTORY_ATTACHMENT_TURNS;
  for (let i = turns.length - 1; i >= 0 && attachmentBudget > 0; i--) {
    const turn = turns[i];
    if (turn.role !== 'user') continue;
    const { images, docs } = parseChatMessageContent(turn.content);
    if (images.length || docs.length) {
      keepAttachmentsAt.add(i);
      attachmentBudget--;
    }
  }

  let out = turns
    .map((turn, i) => {
      let content = turn.content;
      let hasAttachments = false;
      if (turn.role === 'user') {
        const { text, images, docs } = parseChatMessageContent(content);
        const displayText = userMessageDisplayText(text);
        const keepAttachments = keepAttachmentsAt.has(i);
        hasAttachments = keepAttachments && (images.length > 0 || docs.length > 0);
        content = hasAttachments
          ? serializeChatMessageContent(displayText, images, docs)
          : displayText;
      }
      // Attachment-bearing content is base64 and can legitimately exceed
      // MAX_TURN_CHARS; truncating it mid-JSON would corrupt the payload, so
      // only apply the char cap to plain text turns.
      if (!hasAttachments && content.length > MAX_TURN_CHARS) {
        content = `${content.slice(0, MAX_TURN_CHARS)}\n…[turn truncated]`;
      }
      return { role: turn.role, content };
    })
    .filter(turnHasAnthropicContent);
  const cap = agentHistoryCap();
  if (cap != null && out.length > cap) out = out.slice(-cap);
  return out;
}

async function linkedEmailContextLine(emailId: string): Promise<string | null> {
  const email = await storeGetEmailInbox(emailId.trim());
  if (!email) return null;
  const ctx = getAgentContext();
  const lines = ctx.systemAlert
    ? [
        'Automated system alert linked to the inbox email below. Recommend concrete next steps; use inbox tools when appropriate.',
      ]
    : [
        'This chat was opened from the admin Email tab and is linked to the inbox message below. The user did not type or paste the email — the app attached it. Full body is here for tools and context only.',
        'If the latest user message is only the inbox handoff stub ("Please wait for instructions…"), reply in one short sentence (sender or subject — no amounts, receipt numbers, or body recap) and ask what they want done.',
        'When the user asks for something specific (create_email_filter_rule, mark junk/receipt, reply, file to project, etc.), execute with inbox tools — do not wait again.',
        'Do not say you lack the email or ask which message they mean.',
      ];
  if (email.contactName) lines.push(`Client: ${email.contactName}`);
  if (email.jobSlug || email.jobTitle) {
    lines.push(
      `Linked project: ${email.jobTitle || email.jobSlug} (${email.jobSlug || 'unknown slug'})`,
      'Call link_to_work with the slug if this mail belongs to that project.',
    );
  } else {
    lines.push(
      'No linked project yet. Use resolve_contact / create_work if this should become a new project.',
    );
  }
  if (ctx.systemAlert) {
    lines.push(`Message ID: ${email.id} (email body is in the alert message above)`);
  } else {
    lines.push(formatEmailForAgent(email));
  }
  return lines.join('\n\n');
}

async function linkedProjectContextLine(threadId: string): Promise<string | null> {
  const jobs = await listJobsForItem('chat', threadId.trim());
  if (!jobs.length) return null;

  const primary = jobs[0];
  const doc = await storeReadWork(primary.slug);

  const lines = [
    'This chat was opened from the admin Work tab and is linked to the project below. The user did not type or paste the project notes — the app attached them for your context only.',
    'If the latest user message is only the project handoff stub ("Please wait for instructions…"), reply in one short sentence naming the project title only — no notes recap, no issue lists, no audit summaries, no bullet lists from the notes. Ask: "Do you have changes or anything to add to this project?" Do not call read_work for this handoff; the notes are already below.',
    'When the user asks for something specific (update notes, send email, invoice, audit follow-up, etc.), execute with work tools — do not wait again.',
  ];

  if (jobs.length > 1) {
    lines.push(
      `Linked projects: ${jobs.map((j) => `${j.title} (${j.slug})`).join(', ')}`,
      `Primary project notes below are for ${primary.title} (${primary.slug}).`,
    );
  } else {
    lines.push(`Linked project: ${primary.title} (${primary.slug})`);
  }

  if (doc) {
    lines.push(formatWorkForAgent(doc));
  }

  return lines.join('\n\n');
}

export type AgentRunResult = { text: string; usage: AgentUsageSummary | null };

/**
 * Minimal agent loop (Anthropic Messages API): the model may call
 * list_knowledge / read_knowledge / resolve_contact / create_invoice / etc.;
 * we execute each tool and feed results back until it produces a final answer.
 */
export async function runKnowledgeAgent(opts: {
  userText: string;
  images?: ChatImageAttachment[];
  docs?: ChatDocAttachment[];
  priorTurns?: ChatTurn[];
  model?: string | null;
  context?: AgentRunContext;
  signal?: AbortSignal;
  deadline?: AgentDeadline;
}): Promise<AgentRunResult> {
  return runWithAgentContext(opts.context ?? {}, () =>
    runKnowledgeAgentInner(
      {
        userText: opts.userText,
        images: opts.images,
        docs: opts.docs,
        priorTurns: opts.priorTurns,
        model: opts.model,
        deadline: opts.deadline,
      },
      opts.signal ? { signal: opts.signal } : undefined,
    ),
  );
}

export type AgentStreamEvent =
  | {
      type: 'progress';
      phase: 'thinking' | 'tool';
      round?: number;
      tool?: string;
      toolLabel?: string;
      concurrent?: number;
    }
  | { type: 'text'; text: string };

type AgentStreamCallbacks = {
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onProgress?: (update: {
    phase: 'thinking' | 'tool';
    round?: number;
    tool?: string;
    toolLabel?: string;
    concurrent?: number;
  }) => void;
};

type AgentStreamingOpts = {
  userText: string;
  images?: ChatImageAttachment[];
  docs?: ChatDocAttachment[];
  priorTurns?: ChatTurn[];
  model?: string | null;
  context?: AgentRunContext;
  signal?: AbortSignal;
  deadline?: AgentDeadline;
};

/** Stream agent progress + cumulative assistant text (for SSE chat UI). */
export function runKnowledgeAgentStreaming(
  opts: AgentStreamingOpts,
): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
  return runKnowledgeAgentStreamingBridge(opts);
}

async function* runKnowledgeAgentStreamingBridge(
  opts: AgentStreamingOpts,
): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
  const events: AgentStreamEvent[] = [];
  let resolveWait: (() => void) | null = null;
  const emit = (event: AgentStreamEvent) => {
    events.push(event);
    resolveWait?.();
    resolveWait = null;
  };
  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      if (events.length) resolve();
      else resolveWait = resolve;
    });

  let finalResult: AgentRunResult = { text: '', usage: null };
  let runError: unknown;
  const runPromise = runWithAgentContext(opts.context ?? {}, () =>
    runKnowledgeAgentInner(
      {
        userText: opts.userText,
        images: opts.images,
        docs: opts.docs,
        priorTurns: opts.priorTurns,
        model: opts.model,
        deadline: opts.deadline,
      },
      {
        signal: opts.signal,
        onText: (text) => emit({ type: 'text', text }),
        onProgress: (update) => emit({ type: 'progress', ...update }),
      },
    ),
  )
    .then((result) => {
      finalResult = result;
    })
    .catch((err) => {
      runError = err;
    });

  while (true) {
    while (events.length) {
      yield events.shift()!;
    }
    if (runError) throw runError;
    const settled = await Promise.race([
      runPromise.then(() => 'done' as const),
      waitForEvent().then(() => 'event' as const),
    ]);
    if (settled === 'done') {
      while (events.length) yield events.shift()!;
      return finalResult;
    }
  }
}
