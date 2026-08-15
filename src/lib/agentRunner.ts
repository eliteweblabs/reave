import { isAgentModelAuto, labelForAgentModel, resolveAgentModel } from './agentModel';
import { isBraveConfigured } from './braveClient';
import { isPexelsConfigured } from './pexelsClient';
import { buildTools, runTool } from './agentTools';
import { getCompanyBrandContext } from './companyConfig';
import { isContactApiConfigured, siteBaseUrl } from './contactApi';
import { isMaterialsApiConfigured } from './materialsClient';
import { isCardDavConfigured } from './carddav/auth';
import { isMediaWebdavConfigured } from './mediaWebdav/auth';
import { isCraterConfigured } from './craterClient';
import { isBookingConfigured } from './bookingClient';
import { isVapiAdminConfigured } from './vapiPlugin';
import { isUptimeRobotConfigured } from './uptimerobotClient';
import { enabledFeatures, hasFeature } from './features';
import { formatAgentCapabilityInventory } from './featureCatalog';
import { isClerkConfigured } from './clerkClient';
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
import { describeAgentFailure } from './agentFailure';
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

async function runtimeContextLine(model: string, preference?: string | null): Promise<string> {
  const pref = preference?.trim();
  const viaAuto = pref && isAgentModelAuto(pref) ? ` via Auto` : '';
  return [
    await currentDateTimeLine(),
    `Runtime model: ${labelForAgentModel(model)} (${model})${viaAuto}. If asked which model or version you are, report this exactly — do not guess.`,
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
      'No linked project yet. Use resolve_contact / create_work if this should become a new project. Title must be a 2–7 word summary of the email content (what they want done), not the subject line.',
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
    if (runError) {
      const message = describeAgentFailure(runError);
      throw runError instanceof Error && runError.message.trim()
        ? runError
        : new Error(message);
    }
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

async function runKnowledgeAgentInner(
  opts: {
    userText: string;
    images?: ChatImageAttachment[];
    docs?: ChatDocAttachment[];
    priorTurns?: ChatTurn[];
    model?: string | null;
    deadline?: AgentDeadline;
  },
  stream?: AgentStreamCallbacks,
): Promise<AgentRunResult> {
  if (await isSleepModeActive() && !getAgentContext().bypassSleepMode) {
    // Must await — sleepModeBlockMessage is async; returning the Promise as
    // `text` makes settle() throw on `.trim()` and the client reconciles the
    // turn as a mysterious "interrupted" failure instead of the sleep notice.
    return { text: await sleepModeBlockMessage(), usage: null };
  }

  const { userText, images = [], docs = [], priorTurns = [], model: modelOverride } = opts;
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { text: 'LLM is not configured. Set ANTHROPIC_API_KEY.', usage: null };
  }

  const model = await resolveAgentModel(modelOverride, {
    userText,
    hasImages: images.length > 0,
    hasDocs: docs.length > 0,
  });
  const usageAcc = createAgentUsageAccumulator(model);
  const agentCtx = getAgentContext();
  const finishRun = async (text: string): Promise<AgentRunResult> => {
    const usage = finalizeAgentUsage(usageAcc);
    if (usage) logAgentUsage(usage, { threadId: agentCtx.threadId, userTextPreview: userText });
    return { text: await finalizeAgentReply(text, userText), usage };
  };
  const brand = await getCompanyBrandContext();
  const tools = buildAnthropicTools(brand);

  const sysParts = [
    `You are the built-in admin assistant for ${brand.name}'s business OS.`,
    `Terminology: work/job records in the admin Work tab are called "${brand.postAlias.pluralTitle}" (singular "${brand.postAlias.singularTitle}"). Use that term when speaking to the user — not "project" unless that is the configured alias.`,
    `Runtime identity: you run INSIDE the deployed app at ${brand.siteUrl} (Astro on Railway) — not Cursor, not a generic external API, and not on the owner's laptop. The owner chats with you from Admin → Sessions; your tools execute server-side on this same service (Postgres, GitHub, Railway GraphQL, Crater, contact-api, etc.). Never open with "log into Railway", "install the Railway CLI", or "configure a Railway token" — diagnose with your tools first. You cannot fetch Railway build/runtime logs via API; when raw logs are truly needed, say so briefly and point to Railway dashboard → ${brand.projectLabel} → production → service → Logs. Do not claim RAILWAY_API_TOKEN is missing or expired without calling run_dev_task ping_railway first.`,
    'You receive prior turns from this chat. Treat short follow-ups ("yes", "build that", "do it") as continuing the thread — do not ask what to build if the user is agreeing to something you just offered.',
    'Ground answers in tools: call search_knowledge (or list_knowledge) before answering "do we have / is X wired / where is" questions — playbooks are not optional for capability claims. Call resolve_contact when the user mentions a contact/person name or asks who they are (typos, nicknames) — unless this turn already includes structured @-mentions with contact uids (prefer those). resolve_contact accepts name, email, phone (last 4 ok), or q for free-text search across company, notes, and website. To browse or show the full contact list (e.g. "list my contacts"), call list_contacts (optionally with a search term) — do not claim you can only do fuzzy lookups.',
    'Work/jobs: project notes live separately from playbooks (list_work / read_work / create_work / update_work / delete_work). resolve_contact returns work_jobs summaries for that client — call read_work with a slug when you need full job details. When creating a project and the client is unclear, call create_work with title only (or resolve_contact first with any hints from the chat). create_work returns needs_client when you must ask the user who it is; needs_selection + candidates when fuzzy — list the options and ask the user to confirm, then re-call create_work with contact_uid. Never guess a client on ambiguous matches. After create_work or when filing mail to an existing job, call link_to_work so the email/chat stays linked on the project page. Only call delete_work when the user explicitly asks to remove a job. Do not assume job content without reading it. When creating a project from an inbound email, set title to a 2–7 word summary of what they want (from the body/summary) — never copy the email subject line.',
    'Project files: each job has a file repository (list_project_files / add_file_to_project). Images/SVGs/PDFs/PowerPoint files uploaded in a chat linked to a project are saved there automatically. When the user asks to add/save an attachment to a specific client project (e.g. "add this to Reggie\'s newest project"), call add_file_to_project with client name or slug — attachments from the current message are used automatically. read_work includes a files list.',
    'Chat attachments: users can drop images (jpg/png/gif/webp), SVGs, PDFs, and PowerPoint (.pptx) files into chat. SVGs arrive as both a rasterized image (so you can see them) and their raw markup (so you can read/edit the actual SVG code — quote it back with edits rather than describing changes). PDFs arrive as native documents — you can read their text and see their visual layout/charts directly. PowerPoint files arrive as plain text extracted per slide (formatting, images, and speaker notes are not included, and slide order follows the file\'s internal order, which usually matches on-screen order).',
    'Project checklists: action items in job notes use markdown checkboxes (`- [ ]` / `- [x]`). Use toggle_work_item to check off completed work (by item_text or line_index). When invoicing for completed project work, call get_work_invoice_suggestions and use each item\'s description field on Crater line items (user provides price).',
    'Personal to-dos: separate from jobs (create_todo / list_todos / update_todo / mark_todo_done / delete_todo). When the user asks to add something to "the to-do list" or mentions a personal task, decide whether it is a client job (has a client), a project, or a personal task. Personal tasks use the to-do tools — never create_work for them. The same list is also available via Siri Shortcuts on POST /api/siri (actions add_todo / create_todo, list_todos, update_todo, complete_todo, delete_todo) — when the user asks how to add to-dos from Siri or by voice, point them at those actions and the siri-shortcuts knowledge. Freeform "Hey Siri, ask Reave …" uses action prompt / ask / chat. If to-do tools are unavailable (DATABASE_URL not set), say you do not have a to-do list tool yet and ask whether to build it or handle it manually — do not fake it with a job.',
    formatAgentCapabilityInventory(enabledFeatures()),
    'After tools, answer in plain text (short paragraphs, avoid huge markdown tables).',
    'Structured buttons: you may append ```json { "type": "button", "label": "…", "href": "https://…" } ``` blocks for useful external/deep links (projects, billing, docs). Never link to Admin → Sessions or suggest "open session" / "ask the agent" — the owner is already in this session. After create_work or update_work, use the exact profile_url and project_portal_url fields from the tool result for client profile and portal buttons — never put a job slug or business name in /c/… (portal paths use the contact uid UUID only). list_contacts and resolve_contact also return portal_url.',
    'Never end your turn with future-tense promises ("Let me…", "I\'ll…", "I am going to…") without invoking the relevant tools in the same turn first. If you say you will edit, build, commit, push, deploy, send, or run something, call the tools immediately — do not stop and wait for the user to reply. If you cannot proceed (missing permission, ambiguous input, destructive action needing confirmation), say why and ask — do not imply work is in progress.',
    'Verify before claiming you cannot: never tell the user a service is unavailable, a domain is in another account, a feature is missing, or a tool is scoped away without checking the install inventory in this prompt, calling search_knowledge, and (when code_dev is on) grep_code / read_file. A tool missing from this turn is not proof the product lacks the integration — it usually means a module is off or an API key is unset. Never equate "I don\'t have a live API tool this turn" with "this app does not include that." Prefer "Clerk is the auth system; user-admin tools need CLERK_SECRET_KEY" over "we don\'t have Clerk." If the user corrects you ("yes it is", "I\'m looking at it right now", "check the GitHub logs"), search again immediately — do not defend the earlier guess. When the user says they just changed DNS or hosting, re-run dns_check and/or cloudflare_dns before reporting nameserver or SPF conclusions. Prefer "tool returned X" over "I don\'t have access".',
    'Email inbox triage: when the user opens a message from the admin Email tab or asks you to mark junk/spam/delete/filter mail, EXECUTE with tools — do not tell them to do it manually. Use mark_email_junk (needs email_id from triage context), create_email_filter_rule (sender/domain so future mail auto-junks; pass forward_to when they ask to relay mail to another address), and delete_email when they want it removed. Filter rules are indefinite by default; if the user mentions an expiration ("for 7 days", "until Friday", "expires next week"), pass expires_in_days or expires_at on create_email_filter_rule. For payment confirmations with dollar amounts the user wants for taxes, use mark_email_receipt instead of junk/delete. For spam/junk workflows, run all three unless they only asked to hide it. When you have finished handling a legitimate message (replied, filed, scheduled, etc.), use mark_email_routed { email_id } to clear it from the review queue — do not junk processed mail. list_email_inbox finds ids when missing; read_email_inbox returns full headers and body (defaults to the linked email in this chat). Project client replies (action project_reply / status PROJECT_REPLY) are URGENT new work — prioritize immediate follow-up, draft a reply, and link to the project. When sending project-related outbound mail via send_email, pass job_slug so replies trigger those alerts. To send a new outbound email from chat (not a portal link), use send_email { to, subject, body }.',
  ];
  // Deployed Railway containers run from a built dist/ with no git binary and no
  // .git checkout, so shell git (exec_command) cannot commit/push there. When true,
  // the agent must use the GitHub REST API (write_github_file) instead of shelling out.
  const onRailway = Boolean(
    serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() ||
      serverEnv('RAILWAY_ENVIRONMENT')?.trim() ||
      serverEnv('RAILWAY_ENVIRONMENT_NAME')?.trim(),
  );
  if (hasFeature('dev_infra')) {
    sysParts.push('Dev ops: use run_dev_task for service_status or connectivity pings — never ask to run shell commands directly.');
    if (isRailwayConfigured()) {
      sysParts.push(
        `Railway: RAILWAY_API_TOKEN is configured — full Railway API via list_railway_projects, list_railway_services, list_railway_variables, set_railway_variables, list_railway_domains, get_railway_status, list_railway_deployments, get_railway_logs, redeploy_railway_service, and related tools (defaults: ${brand.projectLabel} / production). run_dev_task ping_railway checks token connectivity. Use list_railway_variables to compare env vars — never claim you cannot read Railway Variables without calling the tool first. Do not paste secret values in chat. Inbound receiving uses inbound.${brand.domain || 'the company domain'} — see read_knowledge email-rules.`,
      );
    } else {
      sysParts.push(
        `Railway API token not set — list_railway_domains and ping_railway are unavailable, but you ARE running on Railway. Use check_deployment_status and get_git_status for deploy health; do not tell the owner to add a token just to read logs.`,
      );
    }
    sysParts.push(
      isCloudflareConfigured()
        ? 'Cloudflare: CLOUDFLARE_API_TOKEN is configured — you CAN manage any zone the token reaches via cloudflare_dns: verify / list_records / upsert_record / delete_record / get_ssl_mode / set_ssl_mode. Use set_ssl_mode flexible to fix Error 525 (SSL handshake failed) when the origin cert is broken — do it in the same turn when the user approves; never tell them to log into Cloudflare unless the tool errors. sync_resend_dns is Resend-only. run_dev_task ping_cloudflare checks the token. NEVER say Cloudflare tools are "Resend-only" or that you lack DNS/SSL tools — call cloudflare_dns first and quote its result. Public dns_check is read-only and can show stale NS during propagation.'
        : 'Cloudflare unavailable (CLOUDFLARE_API_TOKEN not set). dns_check still works read-only via public resolvers.',
    );
    sysParts.push(
      'Deploy failures / crash alerts: read_knowledge slug "railway-build-failure-triage" first. One active repair per GitHub repo — duplicate alerts are blocked. Call check_deployment_status, get_railway_status, get_railway_logs, and list_railway_deployments (pass repo + health_url for sibling services). Distinguish rollout teardown vs real failure. On real failure: read changed files, fix via write_github_file(branch:"main") or set missing vars via set_railway_variables in the same turn — do NOT stop at diagnosis or ask the owner to fix manually. End with "✅ RESOLVED — …" or "🚨 UNRESOLVED — …".',
    );
    if (isKinstaConfigured()) {
      sysParts.push(
        `Kinsta: KINSTA_API_KEY + KINSTA_COMPANY_ID are configured — you CAN list WordPress sites, clear cache, create sites, back up environments, AND delete sites via list_kinsta_sites, create_kinsta_site, backup_kinsta_site, list_kinsta_backups, clear_kinsta_cache, delete_kinsta_site, and get_kinsta_operation. run_dev_task ping_kinsta / list_kinsta_sites also work. read_knowledge slug "kinsta-wordpress" for env vars and workflows. Do not claim you lack Kinsta access — call the tool. ${brand.projectLabel} hosting is on Railway, not Kinsta; use Kinsta tools only for Kinsta-hosted WordPress client sites. When the user asks to delete a site, call delete_kinsta_site with the site_id; it is destructive and should be confirmed first.`,
      );
    } else {
      sysParts.push(
        'Kinsta unavailable (KINSTA_API_KEY or KINSTA_COMPANY_ID not set). WordPress-on-Kinsta tasks need those env vars on this service.',
      );
    }
    sysParts.push(
      'Code/deploy checks: to verify work was committed & pushed, call get_git_status or get_recent_commits (GitHub is the source of truth). To verify it is live on Railway, call check_deployment_status or list_railway_deployments. The header deploy bulb is Railway-only (webhooks + optional GraphQL — not GitHub). Deploy banners (🚀 deploying, 🔴 failed, 🟢 live only when asked or right after a deploy lands) prepend agent replies automatically — do not use ✅ for deploy status. Use list_open_branches for in-progress work. run_terminal_command runs read-only git/ls in a sandbox; do not promise to run arbitrary shell. Verify these yourself instead of asking the user to check.',
    );
    if (isGithubConfigured()) {
      const deployDefer =
        isDeferredDeployEnabled()
          ? ' Commits to main during this chat turn are queued and push to GitHub automatically when the turn finishes — do not expect check_deployment_status to show live until then.'
          : ' Committing to main triggers a Railway deploy automatically.';
      sysParts.push(
        `GitHub edits: this project NEVER uses pull requests — always commit straight to main. Call write_github_file with branch:"main" (each call = one commit directly on main); do NOT call create_github_branch or create_pull_request unless the user explicitly asks for a branch/PR. Use create_github_repo to provision a new owner/name repo (auto_init:true when you need a default branch before writing files). Report the commit SHA/URL (or deferred note when queued). Call read_knowledge slug "github-dev-tools" if unsure of the workflow. Do not claim code was pushed unless tools succeed.${deployDefer}`,
      );
      sysParts.push(
        'GitHub scope: write_github_file / create_github_repo only touch source code repos (this app, or an explicitly named sibling service) — a commit is NOT a public URL by itself (no Pages/hosting is wired up) and a brand-new repo is not reachable until deployed. NEVER use these to "host" a one-off asset for a client (an email signature, a vCard/business card, a marketing PDF, etc.), and never invent/guess a path on the client\u2019s own live website — you have no tool that writes files there, so that URL will 404. If the client_portal feature is enabled and the ask is a vCard/business card or an email signature for a specific client to hand out, use get_client_vcard_link / get_client_signature_link instead — those return links this app actually serves. For anything else you cannot really host, say so plainly rather than fabricating a link.',
      );
    } else {
      sysParts.push(
        'GitHub writes unavailable (GITHUB_TOKEN not set). Status tools may still work on public repos with heavy rate limits.',
      );
    }
  }
  if (hasFeature('code_dev')) {
    const deferNote = isDeferredDeployEnabled()
      ? ' Main-branch pushes are deferred until this chat turn finishes so a deploy cannot interrupt the run.'
      : '';
    if (onRailway) {
      sysParts.push(
        `Code development (Reave code_dev) — DEPLOYED CONTAINER: you are running on Railway from a built dist/ with NO git binary and NO .git checkout, so exec_command CANNOT run "git add/commit/push" (git is not in the container PATH). To persist code changes here you MUST use the GitHub REST API: call write_github_file with branch:"main" to commit each file directly on main (never a branch, never a PR). Do not attempt "git push" via exec_command and do not narrate discovering that git is missing — just use write_github_file.${deferNote} You may still use list_files / read_file / write_file / exec_command for reading, running builds/tests, and inspecting the running app, but they only touch the ephemeral container filesystem and are lost on the next deploy. Do not claim success unless tools succeed.`,
      );
    } else {
      sysParts.push(
        `Local code development (Reave code_dev): you CAN edit this repo on disk. Use grep_code to find symbols/paths, then read_file (with offset/limit for large files) / write_file / exec_command. Read before write. Test with exec_command when possible. After every change commit straight to main — NEVER open a pull request: git add and git commit in this turn; git push runs automatically when the turn finishes.${deferNote} Invoke write_file and exec_command in this turn; never reply "Let me commit and push" and stop. Call read_knowledge slug "code-dev-tools" for the playbook. Prefer these over run_terminal_command (read-only sandbox) and over write_github_file when working in a local checkout. Do not claim success unless tools succeed.`,
      );
    }
  }
  if (hasFeature('code_dev') || (hasFeature('dev_infra') && isGithubConfigured())) {
    sysParts.push(
      'Long files — read this before building a page or a large component. A tool call\'s arguments count against your per-response output budget, so a whole long file sent in one write_file/write_github_file call gets cut off mid-argument: the call never runs and NOTHING is written. When a file will run long (roughly 400+ lines, e.g. a full marketing/features page with real copy), plan for it up front: make the first call with the opening section (imports, head, first section markup), then make additional calls to the same path with append:true for each following section, then verify with read_file or get_git_status. Do not announce the page and stop, and do not retry the same oversized single call — split it. Prefer several modest sections over one heroic write.',
    );
  }
  if (hasFeature('billing') && isCraterConfigured()) {
    sysParts.push(
      'Billing: use create_invoice to make invoices in Crater. Treat amounts as whole US dollars. For "invoice <name> for $X" with no line detail, create one line item named "Services rendered" with quantity 1 and price X. When billing for a tracked project, call get_work_invoice_suggestions first — use completed checklist descriptions on line items (name + description from suggestions; ask for price if missing). Invoices default to DRAFT; do not mark SENT unless the user says it was sent. After creating, report the invoice number, amount, and the public link returned by the tool.',
      'Deleting: only call delete_invoice when the user explicitly asks to delete/remove an invoice; confirm the invoice_id first via get_invoice or list_recent_invoices.',
      'Destructive admin tools (reset_invoices) require explicit user confirmation with YES_DELETE_EVERYTHING; prefer dry_run first.'
    );
  } else {
    sysParts.push('Note: invoicing tools are unavailable (CRATER_API_BASE_URL / CRATER_API_TOKEN not set).');
  }
  if (isContactApiConfigured()) {
    sysParts.push(
      'Contacts: full CRUD is available — create_contact, list_contacts, resolve_contact, update_contact, delete_contact. resolve_contact and list_contacts search name, email, phone (last 4 ok), company, website/domain, and internal notes — use q for free-text like "guy with a mustache" or a domain. Use update_contact to change a client\'s name, email, phone, company, or notes. Use delete_contact only when explicitly asked — requires uid (no fuzzy delete). If the contact has attached projects, warn that deleting the client will permanently delete all attached projects; if there are Crater invoices too, mention those separately. Pass force:true after the user confirms.',
      'Client portals: EVERY client automatically has a shareable mobile page at /c/<uid> (a link they open on iPhone and can "Add to Home Screen") — you never need to "create" one. The page shows the client\'s details plus any outstanding Crater invoices (with pay links). list_contacts returns each portal_url, and get_client_portal fetches a single link. The page is tabbed: Overview (headline/body/fields), Billing (automatic from Crater: outstanding, upcoming, previous), and Data (web-design handoff items like passwords/DNS/hosting). Use set_client_portal to CUSTOMIZE Overview content or add Vault items (its `data` param: each item has a label plus any of value/username/password/url; each call appends or updates by id — it does not replace the whole vault). Treat Data items as sensitive credentials. To actually deliver the link to a client ("send the client link to <name>"), use send_client_portal, which emails or texts it to them. These are CLIENT-FACING — never put private/internal notes there. If a name is ambiguous, the tool returns candidates; confirm before sending. Always report the share URL.',
    );
    if (isCardDavConfigured()) {
      sysParts.push(
        `CardDAV (iOS Contacts sync): When the user asks to sync contacts to iPhone, give step-by-step setup (Settings → Contacts → Accounts → Add Account → Other → CardDAV). Server = hostname only (${brand.domain || 'your company domain'}), not a URL with path. Credentials = CARDDAV_USERNAME / CARDDAV_PASSWORD from Railway Variables — never paste values in chat. Always include a required Advanced block: Use SSL On, Port 443, Account URL / Path /carddav — do not say "if it asks for a path"; Advanced is mandatory on iOS. Sync is bidirectional with contact-api. Troubleshooting: ${brand.siteUrl}carddav/ should return 401 (not 404); "verification failed" usually means Advanced path missing. For full playbook call read_knowledge slug "carddav".`,
      );
    } else {
      sysParts.push(
        `CardDAV: Native iOS Contacts sync can be enabled on ${brand.name} by setting CARDDAV_USERNAME + CARDDAV_PASSWORD (requires CONTACT_API_BASE_URL). Call read_knowledge slug "carddav" for iOS setup steps.`,
      );
    }
  } else {
    sysParts.push('Note: resolve_contact and client portals are unavailable (CONTACT_API_BASE_URL not set).');
  }
  if (isMediaWebdavConfigured()) {
    sysParts.push(
      `Media drop folder (WebDAV): The media library mounts as a folder at ${brand.siteUrl}webdav — drag JPEG/PNG/GIF/WebP/SVG/PDF (max 10 MB) from a Mac or iPhone and they appear in Admin → Media. Mac: Finder → Go → Connect to Server (⌘K) → https://${brand.domain || 'your-host'}/webdav as Registered User. iPhone: Files → Browse → ••• → Connect to Server → same URL. Credentials = MEDIA_WEBDAV_USERNAME / MEDIA_WEBDAV_PASSWORD, or CardDAV username/password if media vars are unset — never paste values in chat. Troubleshooting: ${brand.siteUrl}webdav should return 401 (not 404). For the playbook call read_knowledge slug "media-drop-folder".`,
    );
  } else {
    sysParts.push(
      `Media drop folder: Enable a Mac/iPhone folder for the media library by setting MEDIA_WEBDAV_USERNAME + MEDIA_WEBDAV_PASSWORD (or reuse CardDAV credentials). Call read_knowledge slug "media-drop-folder" for Finder and iOS Files setup.`,
    );
  }
  if (isMaterialsApiConfigured()) {
    sysParts.push(
      'Materials pricing: live Home Depot (and future retailer) prices via materials-api. For lumber, drywall, paint, fixtures, or pasted Home Depot URLs, call read_knowledge slug "materials-api-reference" before quoting — do not guess prices. Use POST /api/materials/search, /api/materials/lookup, or /api/materials/quote (or upstream materials-api). Pass zip for store-specific pricing. Map quote line items to Crater invoices via billing tools (whole-dollar prices).',
    );
  }
  if (hasFeature('scheduling') && isBookingConfigured()) {
    sysParts.push(
      `Scheduling: Cal.com is wired via calcom-booking-api. Use list_bookings for today/upcoming meetings; get_booking for one appointment; create_booking to book a specific time (pass duration_minutes when the client asks for a length other than the default 30 — e.g. 60 for an hour; meetings are not open-ended); get_booking_link to share the public booking URL or /form/schedule conversational form (event_slug for non-default lengths). Admin calendar UI uses the configured Cal.com host when set.`,
    );
  }
  if (hasFeature('vapi')) {
    sysParts.push(
      isVapiAdminConfigured()
        ? `Vapi admin plugin: use sync_vapi_assistant to push Company details (${brand.name}) to the Vapi assistant (name, first message, system prompt). Requires owner/deployment credentials. The public Live Speak Agent Widget is separate from this plugin.`
        : `Vapi admin plugin is enabled but not fully configured — set VAPI_API_KEY and assistant id on the server, then sync_vapi_assistant or POST /api/admin/vapi.`,
    );
  }
  if (isClerkConfigured()) {
    sysParts.push(
      'Clerk admin tools are live this turn (clerk_list_users, clerk_get_user, clerk_list_sessions, clerk_list_organizations, and related). Auth itself is always Clerk — these tools manage users/sessions/orgs, they are not what "wires Clerk up."',
    );
  } else {
    sysParts.push(
      'Auth is Clerk (@clerk/astro) on every install. clerk_* admin tools are hidden this turn because CLERK_SECRET_KEY / CLERK_PLATFORM_KEY is not set. That is not the same as "we do not use Clerk."',
    );
  }
  if (hasFeature('uptime_monitoring')) {
    sysParts.push(
      isUptimeRobotConfigured()
        ? `UptimeRobot monitoring: use sync_uptimerobot to pull monitor status from UptimeRobot API and update the local database. Requires owner/deployment credentials. Syncs all monitors with current status and uptime ratios.`
        : `UptimeRobot monitoring is enabled but not fully configured — set UPTIMEROBOT_API_KEY on the server, then sync_uptimerobot or POST /api/admin/uptimerobot.`,
    );
  }
  if (isBraveConfigured()) {
    sysParts.push(
      'Web search: use brave_search to look up public info (businesses, websites, people) when contact-api or knowledge docs do not have the answer.',
    );
  }
  if (hasFeature('stock_photos') && isPexelsConfigured()) {
    sysParts.push(
      'Stock photos: use search_stock_photos to find royalty-free imagery for pages, decks, and newsletters. Pexels terms require crediting the photographer and linking back to the photo\'s Pexels page wherever the image is displayed.',
    );
  }
  if (hasFeature('content_management')) {
    sysParts.push(
      'Website content (no CMS): when the owner asks to change their public site — headline, nav, page copy, images — read config/sites/{siteContentKey}-config.json and src/pages/ with read_file (code_dev) or GitHub, then commit with write_github_file on main (dev_infra + GITHUB_TOKEN). Images belong in the media library (slug → /api/media/{slug} in site config), not git. Pair with search_stock_photos for imagery. read_knowledge slug "content-management" for paths and flows. Never open a PR unless asked. Do not claim the site is updated unless write_github_file succeeds.',
    );
  }
  if (hasFeature('wordpress_content')) {
    sysParts.push(
      'WordPress content plugin: when the owner asks to update a WordPress site (posts, pages, media), use the wordpress_content companion-plugin tools once configured. read_knowledge slug "wordpress-content". Separate from Astro/GitHub content_management. Optional clear_kinsta_cache after publish when Kinsta + dev_infra are available. Do not invent wp-admin steps or claim a change shipped without an API success.',
    );
  }
  if (hasFeature('site_audits')) {
    sysParts.push(
      'Website review: use fetch_url to read a client website (content, title, meta description). Use seo_inventory for the sales SEO checklist (og:image / Open Graph, Twitter cards, robots.txt, XML sitemap, web manifest, favicon, canonical, meta robots/noindex, JSON-LD) with Problem → Impact pitches — run it on every website audit. Use lighthouse_audit for PageSpeed/Lighthouse scores (performance, accessibility, SEO). Call lighthouse_audit at most once per audit — if it fails (timeout, slow website, PSI error), proceed to update_work immediately; do NOT retry (retries burn the tool-round budget and the run will fail). Grade Performance from Chrome UX Report field data when present, otherwise the mobile/desktop lab average — a low lab-mobile score alone is not a failing site (nytimes.com often labs in the 20s). Quick/street audits: pass category "performance" only (2 PSI calls, not 8). Use ssl_check for certificate expiry, TLS, and security headers. Use check_links for broken links and redirects. Use dns_check for public DNS, SPF/DKIM/DMARC, WHOIS, and hosting-company lookup from A-record IPs (Flywheel vs GoDaddy/Bluehost — note the hosting company under DNS & Email; if shared/budget host + lean build + poor Lighthouse, call out a server resource issue under Performance — do not invent a Backup & Hosting section). Use playwright_audit (Playwright / headless Chromium) for real-browser UX on desktop + mobile in the full tier. When the user asks to check or fix Cloudflare DNS or SSL (or says nameservers are Cloudflare), call cloudflare_dns verify then list_records / get_ssl_mode before concluding — dns_check alone can lag after a recent NS change. If fetch_url or ssl_check shows Cloudflare Error 525 (SSL handshake failed), call get_ssl_mode then set_ssl_mode flexible when the user wants it fixed — do not ask them to log into Cloudflare. Use brave_search for Google Business Profile, Apple Business Connect / Apple Maps, Yelp, reviews/reputation, and social presence. Call them yourself when the user asks to review, audit, or check a URL or domain; do not ask them to paste page content.',
      'Audit projects from website audits: call read_knowledge before create_work or update_work. Always set status "audit" (never inquiry or archived) and tags including siri-audit plus quick-audit or full-audit. **Quick/street tier** (Siri "audit" / create_proposal): slug "inquiry-website-audit-quick" — fetch_url, seo_inventory, lighthouse_audit (category performance only), ssl_check, dns_check, brave_search; skip playwright_audit, check_links, detect_tech_stack, and Search/Analytics tools. **Full tier** (Siri "full audit"): slug "inquiry-website-audit" — add playwright_audit (cite as Playwright / Chromium in UX & Mobile sections), check_links, detect_tech_stack, and when analytic_audit is enabled: gsc_search_analytics / gsc_inspect_url / gsc_list_sitemaps plus plausible_stats or ga4_stats (always pass explicit site_url / site_id / property_id — never company domain). If analytics tools return ANALYTICS_FAILED, mark Search / Analytics as Failed and do not invent metrics. Run all read-only audit tools in one parallel batch, then update_work once — do not call read_work for reference during audits. Write a 1,200+ char body (quick) or 1,500+ char body (full) with separate headings for the four Lighthouse categories (Performance, Accessibility, Best Practices, SEO — do not wrap under Website), plus SSL, Content, DNS, Online Presence, Search / Analytics (full), Opportunities, and Action Items — never a short prospect stub. In SEO / Search Rich Results, quote seo_inventory checklist items (og:image, robots.txt, sitemap, manifest, favicon, canonical, JSON-LD) and copy Problem → Impact pitches into Opportunities. In Online Presence, use separate bullets for Google Business Profile, Apple Business Connect, Reviews, Social, and Listings (Found/Missing/Incomplete) — the portal combines Google/Apple/Yelp into one Maps & Directories coverage score. In Opportunities, write Problem → Solution pairs the client portal can promote as service ideas. If a stub project exists, update_work with the full audit (keep status audit). **Title:** catchy finding-based headline (5–12 words) — do NOT include the business name (it shows as the client name in the list). Never "Website Redesign — {Business Name}".',
    );
  }
  if (hasFeature('analytic_audit')) {
    sysParts.push(
      'Search & analytics tools (analytic_audit): gsc_list_sites, gsc_search_analytics, gsc_inspect_url, gsc_list_sitemaps, gsc_submit_sitemap, gsc_add_site, plausible_stats, ga4_list_properties, ga4_stats, indexnow_submit_urls (owned sites only), bing_webmaster_status (placeholder). Always pass explicit site_url / site_id / property_id. On ANALYTICS_FAILED: mark section Failed, do not invent metrics, do not retry. read_knowledge slug "analytic-audit".',
    );
  }

  const linkedEmailId = getAgentContext().emailId?.trim();
  if (linkedEmailId) {
    const linked = await linkedEmailContextLine(linkedEmailId);
    if (linked) sysParts.push(linked);
  }

  const linkedThreadId = getAgentContext().threadId?.trim();
  if (linkedThreadId) {
    const linked = await linkedProjectContextLine(linkedThreadId);
    if (linked) sysParts.push(linked);
  }

  const mentionsLine = formatMentionsContextLine(getAgentContext().mentions ?? []);
  if (mentionsLine) sysParts.push(mentionsLine);

  if (getAgentContext().siriVoice) {
    sysParts.push(
      'The owner is speaking via Siri Shortcuts, not the admin chat UI. Lead with a short spoken answer they can hear out loud: 1–4 plain sentences, no markdown, no code fences, no JSON button blocks. After that spoken lead-in you may add more detail for the chat transcript.',
    );
  }

  const system = cachedSystemBlocks(sysParts.join('\n'), await runtimeContextLine(model, modelOverride));
  const cachedTools = withToolPromptCaching(tools);
  const messages: AnthropicMessage[] = await Promise.all([
    ...trimTurnsForAgent(priorTurns).map(async (turn) => ({
      role: turn.role,
      content: await anthropicContentFromStored(turn.content, turn.role),
    })),
    (async () => ({
      role: 'user' as const,
      content: await buildUserContentBlocks(userText, images, docs),
    }))(),
  ]);

  const maxRounds = agentMaxToolRounds();
  const maxOutputTokens = agentMaxOutputTokens();
  const deadline = opts.deadline ?? createAgentDeadline();
  const llmTurnTimeoutMs = agentLlmTurnTimeoutMs();
  let stallNudges = 0;
  let llmTimeouts = 0;

  const emitProgress = (update: Parameters<typeof setAgentProgress>[2]) => {
    const { userId, threadId } = getAgentContext();
    if (userId && threadId) setAgentProgress(userId, threadId, update);
    stream?.onProgress?.({
      phase: update.phase === 'tool' ? 'tool' : 'thinking',
      round: update.round,
      tool: update.tool,
      toolLabel: update.toolLabel,
      concurrent: update.concurrent,
    });
  };

  const completedStreamTexts: string[] = [];
  let activeRoundStreamText = '';
  const assistantTextFromContent = (blocks: AnthropicContentBlock[]) =>
    blocks
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  const emitStreamedText = () => {
    if (!stream?.onText) return;
    const parts = [...completedStreamTexts];
    if (activeRoundStreamText.trim()) parts.push(activeRoundStreamText);
    const cumulative = parts.join('\n\n');
    stream.onText(cumulative);
    const { userId, threadId } = getAgentContext();
    if (userId && threadId) appendAgentPartialText(userId, threadId, cumulative);
  };
  const finishRoundStream = (finalRoundText?: string) => {
    const roundText = (finalRoundText ?? activeRoundStreamText).trim();
    if (roundText) completedStreamTexts.push(roundText);
    activeRoundStreamText = '';
    emitStreamedText();
  };

  /** Everything the model has said so far this turn, for graceful bail-outs. */
  const partialSoFar = () =>
    [...completedStreamTexts, activeRoundStreamText]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();

  /**
   * End the turn with real content even though the run did not reach a natural
   * finish. The user always gets a reply; the note tells them (and the model, on
   * the next turn) exactly how far it got, so a stalled turn reads as a stalled
   * turn rather than as a completed one that quietly did nothing.
   */
  const bailOut = async (note: string, roundText = ''): Promise<AgentRunResult> => {
    const said = partialSoFar() || roundText.trim();
    return finishRun(said ? `${said}\n\n${note}` : note);
  };

  for (let round = 0; round < maxRounds; round++) {
    throwIfAborted(stream?.signal);

    // A run that has burned its whole budget stops here with whatever it has,
    // rather than starting another round that cannot finish either.
    if (deadline.expired()) {
      return bailOut(
        `_(I ran out of time on this one after ${formatSeconds(deadline.totalMs)} and stopped here. ` +
          'Ask me to continue and I\'ll pick up from this point, or narrow the request to one step.)_',
      );
    }

    emitProgress({ phase: 'thinking', round: round + 1 });

    const apiBody = {
      model,
      max_tokens: maxOutputTokens,
      cache_control: ANTHROPIC_PROMPT_CACHE,
      system,
      messages,
      tools: cachedTools,
    };

    let stopReason: string | undefined;
    let content: AnthropicContentBlock[] = [];

    const turnBudgetMs = deadline.clamp(llmTurnTimeoutMs);
    try {
      if (stream) {
        const result = await withDeadline(
          streamAnthropicMessage(apiBody, {
            signal: stream.signal,
            onText: (text) => {
              activeRoundStreamText = text;
              emitStreamedText();
            },
          }),
          turnBudgetMs,
          'Model response',
        );
        if (!result.ok) {
          return finishRun(formatAnthropicApiError(result.status, result.text));
        }
        addAnthropicUsage(usageAcc, result.data.usage);
        stopReason = result.data.stop_reason;
        content = result.data.content as AnthropicContentBlock[];
      } else {
        const result = await withDeadline(
          createAnthropicMessage(apiBody),
          turnBudgetMs,
          'Model response',
        );
        if (!result.ok) {
          return finishRun(formatAnthropicApiError(result.status, result.text));
        }
        addAnthropicUsage(usageAcc, result.data.usage);
        const data = result.data as {
          stop_reason?: string;
          content?: AnthropicContentBlock[];
        };
        stopReason = data.stop_reason;
        content = data.content ?? [];
      }
    } catch (err) {
      if (!isAgentTimeoutError(err)) throw err;
      // The model stopped sending mid-turn. Retry once from the same state —
      // a stalled stream is usually transient — then give up gracefully.
      llmTimeouts++;
      activeRoundStreamText = '';
      if (llmTimeouts > 1 || deadline.remainingMs() < 20_000) {
        return bailOut(
          '_(The model stopped responding partway through, so I ended the turn here. Please send that again.)_',
        );
      }
      continue;
    }

    if (stopReason === 'tool_use') {
      if (stream) finishRoundStream(assistantTextFromContent(content));
      messages.push({ role: 'assistant', content });

      const calls = content.filter(
        (b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      // runTool always resolves, and never later than the budget we give it, so
      // every tool_use block is guaranteed a matching tool_result either way.
      const invoke = (block: (typeof calls)[number]) =>
        runTool(block.name, JSON.stringify(block.input ?? {}), {
          signal: stream?.signal,
          timeoutMs: Math.max(5_000, deadline.clamp(agentToolTimeoutMs(block.name))),
        }).then((out) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: truncateToolResult(out),
        }));

      let toolResults: AnthropicContentBlock[] = [];
      throwIfAborted(stream?.signal);

      if (canRunToolsConcurrently(calls.map((c) => c.name))) {
        // Progress can only name one tool at a time, so report the slowest of the
        // batch — it is the one the user is really waiting on.
        const headline = [...calls].sort(
          (a, b) => agentToolTimeoutMs(b.name) - agentToolTimeoutMs(a.name),
        )[0];
        emitProgress({
          phase: 'tool',
          round: round + 1,
          tool: headline.name,
          toolLabel: labelForAgentTool(headline.name),
          concurrent: calls.length,
        });
        toolResults = await Promise.all(calls.map(invoke));
      } else {
        for (const block of calls) {
          throwIfAborted(stream?.signal);
          emitProgress({
            phase: 'tool',
            round: round + 1,
            tool: block.name,
            toolLabel: labelForAgentTool(block.name),
          });
          toolResults.push(await invoke(block));
        }
      }

      if (!toolResults.length) {
        return finishRun(
          'The model requested a tool call but returned no usable tool blocks. Try sending your message again.',
        );
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    // Anti-stall: the model either got cut off mid-turn (max_tokens), ended its
    // turn with a future-tense promise but never called a tool, or produced no
    // text and no tool call at all (blank turn). All three leave the user
    // staring at nothing happening. Re-prompt it to actually execute or answer,
    // up to MAX_STALL_NUDGES times, instead of silently returning a dead-end
    // preamble or a bare internal placeholder the user has no way to interpret.
    const truncated = stopReason === 'max_tokens';
    const blank = !text;
    const unfulfilled = looksLikeUnfulfilledPromise(text);
    // When a turn is cut off, the block being written when the budget ran out is
    // usually an oversized write. Naming it lets us give advice that can actually
    // work instead of "try again", which just reproduces the same overrun.
    const cutOffTool = truncated ? truncatedToolName(content) : undefined;

    if ((truncated || blank || unfulfilled) && stallNudges < MAX_STALL_NUDGES) {
      stallNudges++;
      messages.push(assistantTextMessageFor(content, '(interrupted)'));
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: stallNudgeText({ truncated, blank, cutOffTool }) }],
      });
      emitProgress({ phase: 'thinking', round: round + 1 });
      continue;
    }

    if (truncated || blank || unfulfilled) {
      // Out of nudges. Returning `text` here is what made the agent look like it
      // lied: the last thing it said was "Now building the page…", so that became
      // the answer while nothing had been built. Say what actually happened.
      return bailOut(stallExplanation({ truncated, blank, unfulfilled, cutOffTool }), text);
    }

    return finishRun(text);
  }

  return bailOut(
    'I ran out of tool calls trying to solve this. This usually means:\n\n' +
    '1. The question requires reading very large files that get truncated\n' +
    '2. The task is too complex for a single conversation\n' +
    '3. I\'m stuck in a loop trying different approaches\n\n' +
    'Try breaking this down into smaller, more specific questions, or ask me to focus on one aspect at a time.',
  );
}

export const AGENT_EMPTY_REPLY_FALLBACK =
  'I finished that turn without producing any text, which is a bug on my side. Ask me again — ' +
  'if it keeps happening, say "what went wrong?" and I\'ll check the run.';

/**
 * Last stop before the reply is persisted and streamed. Guarantees a non-empty
 * string, and never lets an optional decoration (the deploy banner, which hits
 * GitHub/Railway) turn a good answer into a failed turn.
 */
async function finalizeAgentReply(text: string, userText: string): Promise<string> {
  const body = text?.trim() ? text : AGENT_EMPTY_REPLY_FALLBACK;
  if (!hasFeature('dev_infra')) return body;
  try {
    const withBanner = await withDeadline(
      prependDeployBanner(body, { userText }),
      15_000,
      'Deploy status banner',
    );
    return withBanner?.trim() ? withBanner : body;
  } catch {
    return body;
  }
}
