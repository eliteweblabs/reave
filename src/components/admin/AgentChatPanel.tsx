import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from 'react';
import {
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  AuiIf,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  MessagePrimitive,
  ThreadPrimitive,
  generateId,
  useAuiEvent,
  useComposerRuntime,
  useLocalRuntime,
  useAuiState,
  useThreadRuntime,
  useThreadViewport,
  type AttachmentAdapter,
  type ChatModelAdapter,
  type CompleteAttachment,
  type PendingAttachment,
  type ThreadMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  filterHelperCommands,
  matchHelperCommand,
  type AgentHelperCommand,
} from '../../lib/agentHelperCommands';
import {
  activeMentionQueryAt,
  embedMentionTokens,
  mergeChatMentions,
  mentionKey,
  mentionsPresentInText,
  parseMentionTokensFromText,
  sanitizeMentionLabel,
  serializeMentionToken,
  splitMentionText,
  stripMentionTokensForDisplay,
  type ChatMention,
  type PeopleSearchResult,
} from '../../lib/chatMentions';
import {
  ComposerMentionInput,
  type ComposerFieldHandle,
} from './ComposerMentionInput';
import {
  parseStoredChatContent,
  storedChatPlainText,
  userMessageBubbleText,
  type StoredChatDoc,
  type StoredChatImage,
} from '../../lib/chatMessageFormat';
import {
  classifyChatButtonHref,
  getButtonProps,
  openChatButtonHref,
  parseAssistantChatButtons,
  withChatReturnHref,
} from '../../lib/chatResponseRenderer';
import { combineAbortSignals, isSseStalledError, readSseStream } from '../../lib/chatAgentSse';
import { formatAgentUsageLine, type AgentUsageSummary } from '../../lib/agentUsage';
import { armAgentTones, playChatDoneTone, playDeployDoneTone, resumeAgentTones } from '../../lib/agentTones';
import { isChatRunActive, sameAgentProgressUi, type AgentProgress } from '../../lib/agentProgress';
import { useChatRenderer } from '../../hooks/useChatRenderer';
import { ChatButton } from '../ChatButton';
import './agent-chat.css';

/** Match API limits in `src/pages/api/chats/[id].ts`. */
const MAX_CHAT_IMAGES = 5;
const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const CHAT_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.jpg,.jpeg,.png,.gif,.webp,.svg';

const MAX_CHAT_DOCS = 3;
const MAX_CHAT_DOC_BYTES = 10 * 1024 * 1024;
/** Match public/deploy-indicator.js — poll faster while chat is locked so the banner clears with Railway. */
const DEPLOY_CHAT_LOCK_POLL_MS_ACTIVE = 5_000;
const DEPLOY_CHAT_LOCK_POLL_MS_IDLE = 15_000;
const DEPLOY_CHAT_RELOAD_KEY = 'reave:deploy-reload-sha';
/** Survive deploy-lock UI swap + the post-deploy hard reload. */
const DEPLOY_CHAT_DRAFT_KEY = 'reave:deploy-chat-draft';
const PPTX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const CHAT_DOC_ACCEPT = `application/pdf,${PPTX_MEDIA_TYPE},.pdf,.pptx`;

/** Empty-state welcome lines, keyed by local time of day (like Claude's rotating greetings). */
const CHAT_WELCOME_BY_PERIOD = {
  morning: [
    'Good morning. What are we working on today?',
    'Morning! Ready when you are.',
    "Good morning — what'll it be?",
  ],
  afternoon: [
    'Good afternoon. What can I help with?',
    'Afternoon. What are we working on?',
    'Hey — what should we tackle?',
  ],
  evening: [
    'Good evening. What are we working on?',
    'Evening! How can I help?',
    "Good evening — what's on the agenda?",
  ],
  late: [
    "Burning the midnight oil? What's up?",
    'Still going? What can I help with?',
    'Late one — what are we working on?',
  ],
} as const;

function chatWelcomePeriod(date = new Date()): keyof typeof CHAT_WELCOME_BY_PERIOD {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late';
}

function pickChatWelcomeGreeting(date = new Date()): string {
  const pool = CHAT_WELCOME_BY_PERIOD[chatWelcomePeriod(date)];
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
}

function normalizeChatImageMediaType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpg' || type === 'image/jpeg') return 'image/jpeg';
  if (
    type === 'image/png' ||
    type === 'image/gif' ||
    type === 'image/webp' ||
    type === 'image/svg+xml'
  )
    return type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return type || 'image/png';
}

function normalizeChatDocMediaType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || type === PPTX_MEDIA_TYPE) return type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'pptx') return PPTX_MEDIA_TYPE;
  return type || 'application/octet-stream';
}

function fileLabelForMimeType(mimeType?: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === PPTX_MEDIA_TYPE) return 'PowerPoint file';
  return 'File';
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

/**
 * Image adapter with unique attachment ids.
 * `SimpleImageAttachmentAdapter` uses `file.name` as id, so a second paste/upload
 * named `image.png` upserts over the first instead of appending.
 */
class ChatImageAttachmentAdapter implements AttachmentAdapter {
  public accept = CHAT_IMAGE_ACCEPT;

  public async add(state: { file: File }): Promise<PendingAttachment> {
    if (state.file.size > MAX_CHAT_IMAGE_BYTES) {
      throw new Error('Image must be 5 MB or smaller');
    }
    const mediaType = normalizeChatImageMediaType(state.file);
    const file =
      state.file.type === mediaType
        ? state.file
        : new File([state.file], state.file.name || `image.${mediaType.split('/')[1] || 'png'}`, {
            type: mediaType,
          });
    return {
      id: generateId(),
      type: 'image',
      name: file.name,
      contentType: mediaType,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  public async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    return {
      ...attachment,
      status: { type: 'complete' },
      content: [{ type: 'image', image: await fileToDataURL(attachment.file) }],
    };
  }

  public async remove() {
    // noop
  }
}

/** PDF / PowerPoint (pptx) adapter — sent to the model as a `file` part (base64 data URL). */
class ChatDocAttachmentAdapter implements AttachmentAdapter {
  public accept = CHAT_DOC_ACCEPT;

  public async add(state: { file: File }): Promise<PendingAttachment> {
    if (state.file.size > MAX_CHAT_DOC_BYTES) {
      throw new Error('File must be 10 MB or smaller');
    }
    const mediaType = normalizeChatDocMediaType(state.file);
    return {
      id: generateId(),
      type: 'file',
      name: state.file.name,
      contentType: mediaType,
      file: state.file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  public async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    return {
      ...attachment,
      status: { type: 'complete' },
      content: [
        {
          type: 'file',
          data: await fileToDataURL(attachment.file),
          mimeType: attachment.contentType || 'application/octet-stream',
          filename: attachment.name,
        },
      ],
    };
  }

  public async remove() {
    // noop
  }
}

function useCapComposerAttachments(max = MAX_CHAT_IMAGES + MAX_CHAT_DOCS) {
  const composer = useComposerRuntime();
  useAuiEvent('composer.attachmentAdd', () => {
    const { attachments } = composer.getState();
    if (attachments.length <= max) return;
    // Drop oldest first so the newest selection/paste/drop is kept.
    const toRemove = attachments.slice(0, attachments.length - max);
    for (const att of toRemove) {
      const idx = composer.getState().attachments.findIndex((a) => a.id === att.id);
      if (idx >= 0) void composer.getAttachmentByIndex(idx).remove();
    }
  });
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(1, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function statusLabelFromProgress(progress: AgentProgress | null): string {
  if (progress?.phase === 'tool' && progress.toolLabel) {
    return progress.toolLabel;
  }
  if ((progress?.round ?? 0) > 1) {
    return 'Analyzing results';
  }
  return 'Thinking';
}

function useAgentRunStatus(
  threadId: string,
  externalProgress: AgentProgress | null,
  useExternalProgress: boolean,
  streamedProgress: AgentProgress | null,
) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [polledProgress, setPolledProgress] = useState<AgentProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const activeProgress = useExternalProgress
    ? externalProgress
    : streamedProgress ?? polledProgress;

  useEffect(() => {
    if (!isRunning || useExternalProgress) {
      if (!useExternalProgress) {
        startedAtRef.current = null;
        setPolledProgress(null);
        setElapsedMs(0);
      }
      return;
    }

    if (!streamedProgress && !startedAtRef.current) {
      startedAtRef.current = Date.now();
    }

    let cancelled = false;

    const poll = async () => {
      if (streamedProgress) return;
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}/progress`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { progress?: AgentProgress | null };
        if (!cancelled && !streamedProgress) {
          setPolledProgress((prev) =>
            sameAgentProgressUi(prev, data.progress) ? prev : (data.progress ?? null),
          );
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    void poll();
    const pollTimer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [isRunning, threadId, useExternalProgress, streamedProgress]);

  useEffect(() => {
    const started =
      activeProgress?.startedAt ??
      (isRunning && !useExternalProgress ? startedAtRef.current : null);
    if (started) startedAtRef.current = started;
    if (!started) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(Date.now() - started);
    const elapsedTimer = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 1000);
    return () => window.clearInterval(elapsedTimer);
  }, [activeProgress, isRunning, useExternalProgress]);

  const showRunning = isRunning || useExternalProgress;
  const label = statusLabelFromProgress(activeProgress);
  const elapsed = formatElapsed(elapsedMs);
  const concurrent = activeProgress?.concurrent ?? 0;
  const detailText =
    activeProgress?.phase === 'tool' && activeProgress.tool
      ? concurrent > 1
        ? `Running ${concurrent} checks at once`
        : `Running ${activeProgress.tool.replace(/_/g, ' ')}`
      : activeProgress?.round && activeProgress.round > 1
        ? `Step ${activeProgress.round}`
        : 'Working on your request';

  return { isRunning: showRunning, label, elapsed, detailText, progress: activeProgress };
}

function AgentRunStatusCopy({
  label,
  elapsed,
  detailText,
}: {
  label: string;
  elapsed: string;
  detailText: string;
}) {
  return (
    <span className="aui-run-status-copy">
      <span className="aui-run-status-primary">
        {label}
        <span className="aui-run-status-ellipsis" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {' · '}
        {elapsed}
      </span>
      <span className="aui-run-status-detail">{detailText}</span>
    </span>
  );
}

function AgentRunStatus({
  threadId,
  externalProgress,
  useExternalProgress,
  streamedProgress,
}: {
  threadId: string;
  externalProgress: AgentProgress | null;
  useExternalProgress: boolean;
  streamedProgress: AgentProgress | null;
}) {
  const { label, elapsed, detailText } = useAgentRunStatus(
    threadId,
    externalProgress,
    useExternalProgress,
    streamedProgress,
  );

  return (
    <div className="aui-run-status">
      <AgentRunStatusCopy label={label} elapsed={elapsed} detailText={detailText} />
    </div>
  );
}

function InThreadRunStatus({
  threadId,
  externalProgress,
  useExternalProgress,
  streamedProgress,
}: {
  threadId: string;
  externalProgress: AgentProgress | null;
  useExternalProgress: boolean;
  streamedProgress: AgentProgress | null;
}) {
  const { label, elapsed, detailText } = useAgentRunStatus(
    threadId,
    externalProgress,
    useExternalProgress,
    streamedProgress,
  );

  return (
    <div className="aui-msg-row aui-msg-row-assistant aui-msg-row-thinking" aria-live="polite">
      <div className="aui-msg-wrap aui-msg-wrap-assistant">
        <div className="aui-msg aui-msg-assistant aui-msg-thinking">
          <AgentRunStatusCopy label={label} elapsed={elapsed} detailText={detailText} />
        </div>
      </div>
    </div>
  );
}

function readCompanyBrandName(fallback = 'Assistant'): string {
  if (typeof window === 'undefined') return fallback;
  const name = (window as Window & { __companyBrand?: { name?: string } }).__companyBrand?.name?.trim();
  return name || fallback;
}

export type StoredChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  agent_usage?: AgentUsageSummary | null;
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** iOS-style day pill: Today, Yesterday, weekday, or calendar date. */
function formatChatDayLabel(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatChatMessageTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const COPY_FEEDBACK_MS = 1000;

type MessageContentPart = {
  type: string;
  text?: string;
  filename?: string;
};

function messageTextForCopy(
  content: ReadonlyArray<MessageContentPart> | undefined,
): string {
  if (!content?.length) return '';
  const textParts: string[] = [];
  const attachments: string[] = [];
  for (const part of content) {
    if (part.type === 'text') textParts.push(part.text ?? '');
    else if (part.type === 'image') attachments.push('image');
    else if (part.type === 'file') attachments.push(part.filename || 'file');
  }
  const text = stripMentionTokensForDisplay(textParts.join(''));
  if (!attachments.length) return text;
  const summary = attachments.join(', ');
  if (!text.trim()) return `[${summary}]`;
  return `${text}\n[${summary} attached]`;
}

/** Pack glyphs: IOS_ICONS.copy / check — keep in sync with public/admin/admin-ui.js */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChatMessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const disabled = !text.trim();

  const onCopy = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
      } catch {
        /* clipboard unavailable */
      }
    },
    [text],
  );

  return (
    <button
      type="button"
      className={`aui-msg-copy${copied ? ' is-copy-success' : ''}`}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy'}
      disabled={disabled}
      onClick={onCopy}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function ChatMessageDaySeparator({ label }: { label: string }) {
  return (
    <div className="aui-msg-day" role="separator" aria-label={label}>
      <span className="aui-msg-day-label">{label}</span>
    </div>
  );
}

function ChatMessageShell({
  align,
  bubbleClassName,
  children,
}: {
  align: 'user' | 'assistant';
  bubbleClassName: string;
  children: ReactNode;
}) {
  const createdAt = useAuiState((s) => s.message.createdAt);
  const agentUsage = useAuiState((s) => {
    if (align !== 'assistant') return null;
    const metadata = s.message.metadata as { agentUsage?: AgentUsageSummary } | undefined;
    return metadata?.agentUsage ?? null;
  });
  const showDaySeparator = useAuiState((s) => {
    const idx = s.message.index;
    if (idx <= 0) return true;
    const prev = s.thread.messages[idx - 1]?.createdAt;
    if (!prev) return true;
    return !sameCalendarDay(prev, createdAt);
  });
  const plainText = useAuiState((s) => messageTextForCopy(s.message.content));

  return (
    <>
      {showDaySeparator ? <ChatMessageDaySeparator label={formatChatDayLabel(createdAt)} /> : null}
      <MessagePrimitive.Root className={`aui-msg-row aui-msg-row-${align} group/message`}>
        <div className={`aui-msg-wrap aui-msg-wrap-${align}`}>
          <div className={bubbleClassName}>{children}</div>
          <div className={`aui-msg-meta aui-msg-meta--${align}`}>
            <time className={`aui-msg-time aui-msg-time--${align}`} dateTime={createdAt.toISOString()}>
              {formatChatMessageTime(createdAt)}
              {agentUsage ? (
                <span className="aui-msg-usage" title={`${agentUsage.model_label} · estimated API cost`}>
                  {' · '}
                  {formatAgentUsageLine(agentUsage)}
                </span>
              ) : null}
            </time>
            <ChatMessageCopyButton text={plainText} />
          </div>
        </div>
      </MessagePrimitive.Root>
    </>
  );
}

export type AgentChatPanelProps = {
  threadId: string;
  companyName?: string;
  initialMessages: StoredChatMessage[];
  pendingDraft?: string | null;
  pendingAutoSend?: boolean;
  /** Focus the composer once after mount (e.g. newly created empty session). */
  autoFocusComposer?: boolean;
  /** `focus` — minimal full-screen skin at `/focus` (no footer nav padding). */
  variant?: 'default' | 'focus';
  getModel?: () => string | undefined;
  onComposeFocus?: (focused: boolean) => void;
  onComposeDirty?: (dirty: boolean) => void;
  onAgentRunChange?: (running: boolean) => void;
  onAgentProgress?: (progress: AgentProgress | null) => void;
  onRefreshMessages?: () => void | Promise<void>;
  /** Bump to import `initialMessages` into the live runtime without remounting. */
  importMessagesGeneration?: number;
  onMessagesPersist?: (
    userContent: string,
    assistant: { content: string; agent_usage?: AgentUsageSummary | null },
  ) => void;
  onTitleUpdate?: (title: string) => void;
  onLinkedJobsRefresh?: () => void;
};

type SendResult = {
  ok?: boolean;
  error?: string;
  title?: string;
  userMessage?: StoredChatMessage;
  assistantMessage?: StoredChatMessage;
  agent_usage?: AgentUsageSummary | null;
};

function storedToThreadMessage(message: StoredChatMessage): ThreadMessageLike {
  const createdAt = message.created_at ? new Date(message.created_at) : new Date();
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      createdAt,
      metadata: message.agent_usage
        ? ({ agentUsage: message.agent_usage } as ThreadMessageLike['metadata'])
        : undefined,
      content: [{ type: 'text', text: storedChatPlainText(message.content) }],
    };
  }
  const { text, images, docs } = parseStoredChatContent(message.content);
  const displayText = message.role === 'user' ? userMessageBubbleText(text) : text;
  const content: Extract<ThreadMessageLike['content'], readonly unknown[]>[number][] = [];
  if (displayText) content.push({ type: 'text', text: displayText });
  for (const img of images) {
    content.push({
      type: 'image',
      image: `data:${img.mediaType};base64,${img.data}`,
    });
  }
  for (const doc of docs) {
    content.push({
      type: 'file',
      data: `data:${doc.mediaType};base64,${doc.data}`,
      mimeType: doc.mediaType,
      filename: doc.filename,
    });
  }
  if (!content.length) content.push({ type: 'text', text: '' });
  return { role: 'user', createdAt, content };
}

function imageDataFromSrc(src: string): StoredChatImage | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(src);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function extractImagesFromUserMessage(message: ThreadMessage): StoredChatImage[] {
  const images: StoredChatImage[] = [];
  const scan = (parts: readonly { type: string; image?: string }[]) => {
    for (const part of parts) {
      if (part.type !== 'image') continue;
      const src = typeof part.image === 'string' ? part.image : '';
      const parsed = imageDataFromSrc(src);
      if (parsed) images.push(parsed);
    }
  };
  scan(message.content ?? []);
  if (message.role === 'user') {
    for (const att of message.attachments ?? []) {
      scan(att.content ?? []);
    }
  }
  return images;
}

function extractDocsFromUserMessage(message: ThreadMessage): StoredChatDoc[] {
  const docs: StoredChatDoc[] = [];
  const scan = (
    parts: readonly { type: string; data?: string; mimeType?: string; filename?: string }[],
  ) => {
    for (const part of parts) {
      if (part.type !== 'file') continue;
      const src = typeof part.data === 'string' ? part.data : '';
      const match = /^data:([^;]+);base64,(.+)$/.exec(src);
      if (!match) continue;
      docs.push({
        mediaType: part.mimeType || match[1],
        filename: part.filename || 'attachment',
        data: match[2],
      });
    }
  };
  scan(message.content ?? []);
  if (message.role === 'user') {
    for (const att of message.attachments ?? []) {
      scan(att.content ?? []);
    }
  }
  return docs;
}

/**
 * The server heartbeats every 10s while a run is alive, so silence for this long
 * means the connection is gone — not that the agent is thinking hard.
 */
const STREAM_IDLE_TIMEOUT_MS = 40_000;
/** How long to keep following a run from the server after the stream dies. */
const RECOVERY_MAX_MS = 15 * 60_000;
const RECOVERY_POLL_MS = 1_500;

const CONNECTION_LOST_NOTE =
  'The connection to the server dropped and I could not recover this reply. The work may ' +
  'have finished server-side — reopen this session to check, or send the message again.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError';
}

async function fetchRunProgress(
  threadId: string,
): Promise<{ running: boolean; progress: AgentProgress | null } | null> {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}/progress`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { running?: boolean; progress?: AgentProgress | null };
    return { running: Boolean(data.running), progress: data.progress ?? null };
  } catch {
    return null;
  }
}

/**
 * The reply the server actually persisted for this turn, or null if the thread
 * still ends on the user's message (the run died without writing anything).
 */
async function fetchPersistedReply(threadId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      thread?: { messages?: { role: string; content: string }[] };
    };
    const messages = data.thread?.messages ?? [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return null;
    return storedChatPlainText(last.content);
  } catch {
    return null;
  }
}

/**
 * Take over a turn whose SSE stream died, and always end with something to show.
 *
 * The run itself is deliberately not tied to the HTTP connection, so it is
 * almost certainly still going. We follow it via the progress API (surfacing its
 * partial text and tool status as it goes), then read the reply it persisted.
 * Yields the text to display, most recent last.
 */
async function* recoverTurnFromServer(
  threadId: string,
  streamedText: string,
  emitProgress: (update: Omit<AgentProgress, 'startedAt' | 'updatedAt'>) => void,
  onRecovered: () => void,
  signal?: AbortSignal,
): AsyncGenerator<string, void> {
  const giveUpAt = Date.now() + RECOVERY_MAX_MS;
  let shown = streamedText;

  while (Date.now() < giveUpAt) {
    throwIfAborted(signal);
    const status = await fetchRunProgress(threadId);
    if (!status || (!status.running && !status.progress)) break;

    if (status.progress) {
      emitProgress({
        phase: status.progress.phase === 'tool' ? 'tool' : 'thinking',
        tool: status.progress.tool,
        toolLabel: status.progress.toolLabel,
        round: status.progress.round,
        concurrent: status.progress.concurrent,
      });
      const partial = status.progress.partialText ?? '';
      if (partial.length > shown.length) {
        shown = partial;
        yield shown;
      }
    }
    await sleep(RECOVERY_POLL_MS);
  }

  throwIfAborted(signal);

  const persisted = await fetchPersistedReply(threadId);
  if (persisted?.trim()) {
    onRecovered();
    yield persisted;
    return;
  }

  // Nothing persisted and nothing running: the run died without writing a reply
  // (typically a container restart mid-run). Have the server record that, so the
  // thread is not left permanently unanswered.
  const note = await reconcileDeadTurn(threadId);
  if (note?.trim()) {
    onRecovered();
    yield note;
    return;
  }

  yield shown.trim() ? `${shown}\n\n_(${CONNECTION_LOST_NOTE})_` : `_(${CONNECTION_LOST_NOTE})_`;
}

/** Ask the server to close out a turn whose run vanished (e.g. a deploy restart). */
async function reconcileDeadTurn(threadId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}/reconcile`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      reconciled?: boolean;
      assistantMessage?: { content?: string };
    };
    const content = data.assistantMessage?.content;
    return content ? storedChatPlainText(content) : null;
  } catch {
    return null;
  }
}

function createChatAdapter(
  threadId: string,
  propsRef: RefObject<AgentChatPanelProps>,
  onStreamedProgress: (progress: AgentProgress | null) => void,
  pendingMentionsRef: RefObject<ChatMention[]>,
): ChatModelAdapter {
  return {
    async *run(options) {
      const lastUser = [...options.messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) throw new Error('No user message');

      const textRaw = (lastUser.content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
        .trim();

      const images = extractImagesFromUserMessage(lastUser);
      const docs = extractDocsFromUserMessage(lastUser);
      const model = propsRef.current?.getModel?.();
      const pending = pendingMentionsRef.current ?? [];
      const fromPending = mentionsPresentInText(pending, textRaw);
      // Embed durable @[Name](contact:uid) tokens so the UUID is in the message body.
      const text = embedMentionTokens(textRaw, fromPending);
      const mentions = mergeChatMentions(parseMentionTokensFromText(text), fromPending);
      pendingMentionsRef.current = [];
      const runStartedAt = Date.now();

      const emitProgress = (update: Omit<AgentProgress, 'startedAt' | 'updatedAt'>) => {
        const progress: AgentProgress = {
          ...update,
          startedAt: runStartedAt,
          updatedAt: Date.now(),
        };
        onStreamedProgress(progress);
        propsRef.current?.onAgentProgress?.(progress);
      };

      propsRef.current?.onAgentRunChange?.(true);
      resumeAgentTones();
      emitProgress({ phase: 'thinking', round: 1 });
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: text,
            images,
            docs,
            stream: true,
            ...(mentions.length ? { mentions } : {}),
            ...(model ? { model } : {}),
          }),
          signal: options.abortSignal,
        });

        if (!res.ok) {
          let errData: { deploy_locked?: boolean; error?: string } = {};
          try {
            errData = (await res.json()) as typeof errData;
          } catch {
            /* ignore */
          }
          throw new Error(
            errData.error ||
              (errData.deploy_locked
                ? 'Deploy in progress — try again when live.'
                : `Request failed (${res.status})`),
          );
        }

        const contentType = res.headers.get('Content-Type') ?? '';
        if (contentType.includes('text/event-stream') && res.body) {
          let streamedText = '';
          let resolved = false;
          const serverFinished = new AbortController();
          let sawServerRunning = false;
          let idlePolls = 0;
          const watchServerIdle = window.setInterval(() => {
            void fetchRunProgress(threadId).then((status) => {
              if (!status) return;
              if (isChatRunActive(status)) {
                sawServerRunning = true;
                idlePolls = 0;
                return;
              }
              if (!streamedText.trim()) return;
              // The run may not be registered yet on the first poll.
              if (!sawServerRunning && Date.now() - runStartedAt < 8_000) return;
              idlePolls += 1;
              if (idlePolls < 2) return;
              resolved = true;
              if (!serverFinished.signal.aborted) serverFinished.abort();
            });
          }, 2_000);

          try {
            for await (const { event, data } of readSseStream(
              res.body,
              combineAbortSignals(options.abortSignal, serverFinished.signal),
              {
                idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
              },
            )) {
              if (event === 'progress') {
                emitProgress({
                  phase: data.phase === 'tool' ? 'tool' : 'thinking',
                  tool: typeof data.tool === 'string' ? data.tool : undefined,
                  toolLabel: typeof data.toolLabel === 'string' ? data.toolLabel : undefined,
                  round: typeof data.round === 'number' ? data.round : undefined,
                  concurrent: typeof data.concurrent === 'number' ? data.concurrent : undefined,
                });
              } else if (event === 'text' && typeof data.text === 'string') {
                // Ignore shrinking updates (e.g. a new Anthropic round starting with "").
                if (data.text.length >= streamedText.length) {
                  streamedText = data.text;
                  yield { content: [{ type: 'text', text: streamedText }] };
                }
              } else if (event === 'done') {
                if (typeof data.title === 'string') propsRef.current?.onTitleUpdate?.(data.title);
                propsRef.current?.onLinkedJobsRefresh?.();
                const userMsg = data.userMessage as { content?: string } | undefined;
                const assistantMsg = data.assistantMessage as
                  | { content?: string; agent_usage?: AgentUsageSummary | null }
                  | undefined;
                const agentUsage =
                  (data.agent_usage as AgentUsageSummary | null | undefined) ??
                  assistantMsg?.agent_usage ??
                  null;
                if (userMsg?.content && assistantMsg?.content) {
                  propsRef.current?.onMessagesPersist?.(userMsg.content, {
                    content: assistantMsg.content,
                    agent_usage: agentUsage,
                  });
                }
                const assistantText = storedChatPlainText(assistantMsg?.content ?? streamedText);
                if (assistantText && assistantText !== streamedText) {
                  streamedText = assistantText;
                  yield { content: [{ type: 'text', text: assistantText }] };
                }
                resolved = Boolean(assistantText.trim());
                break;
              }
              // An `error` event (or a stream that just ends) is not the end of
              // the turn: the run may well have finished and persisted its reply
              // on the server. Fall through to recovery rather than dead-ending.
            }
          } catch (err) {
            if (isAbortError(err) && options.abortSignal?.aborted) throw err;
            if (isAbortError(err) && serverFinished.signal.aborted && resolved) {
              void propsRef.current?.onRefreshMessages?.();
              return;
            }
            if (!isSseStalledError(err) && !(err instanceof TypeError) && !isAbortError(err)) throw err;
            // Stalled or network-level failure: the server is still working.
          } finally {
            window.clearInterval(watchServerIdle);
          }

          if (resolved) return;

          // The stream ended without delivering a reply. Follow the run through
          // the progress API and read whatever it persists, so a dropped socket
          // costs the user a few seconds instead of the whole answer.
          for await (const text of recoverTurnFromServer(
            threadId,
            streamedText,
            emitProgress,
            () => void propsRef.current?.onRefreshMessages?.(),
            options.abortSignal,
          )) {
            yield { content: [{ type: 'text', text }] };
          }
          return;
        }

        let data: SendResult = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }

        if (data.title) propsRef.current?.onTitleUpdate?.(data.title);
        propsRef.current?.onLinkedJobsRefresh?.();
        if (data.userMessage?.content && data.assistantMessage?.content) {
          propsRef.current?.onMessagesPersist?.(data.userMessage.content, {
            content: data.assistantMessage.content,
            agent_usage: data.agent_usage ?? data.assistantMessage.agent_usage ?? null,
          });
        }

        const assistantText = storedChatPlainText(data.assistantMessage?.content ?? '');
        if (assistantText.trim()) {
          yield { content: [{ type: 'text', text: assistantText }] };
          return;
        }

        // No usable reply in the JSON response either — same recovery path as a
        // broken stream, so the turn still ends with something on screen.
        for await (const recovered of recoverTurnFromServer(
          threadId,
          '',
          emitProgress,
          () => void propsRef.current?.onRefreshMessages?.(),
          options.abortSignal,
        )) {
          yield { content: [{ type: 'text', text: recovered }] };
        }
      } catch (err) {
        if (isAbortError(err) && options.abortSignal?.aborted) throw err;
        // A thrown error puts assistant-ui into its error state, which reads as a
        // dead chat. Try the server one more time, and failing that say what
        // happened in the message itself.
        try {
          let recoveredAny = false;
          for await (const recovered of recoverTurnFromServer(
            threadId,
            '',
            emitProgress,
            () => void propsRef.current?.onRefreshMessages?.(),
            options.abortSignal,
          )) {
            recoveredAny = true;
            yield { content: [{ type: 'text', text: recovered }] };
          }
          if (recoveredAny) return;
        } catch {
          /* fall through to the plain message below */
        }
        const detail = err instanceof Error ? err.message : String(err);
        yield {
          content: [
            {
              type: 'text',
              text: `_(That message failed to send: ${detail}. Nothing was lost — try again.)_`,
            },
          ],
        };
      } finally {
        onStreamedProgress(null);
        propsRef.current?.onAgentProgress?.(null);
        propsRef.current?.onAgentRunChange?.(false);
        if (!options.abortSignal?.aborted) playChatDoneTone();
      }
    },
  };
}

type DeployChatDraftPayload = { threadId: string; text: string; autoSend?: boolean };
type DeployChatDraftEntry = { text: string; autoSend?: boolean };

type DeployIndicatorPayload = {
  chatLocked?: boolean;
  chatLockMessage?: string | null;
  state?: string;
  deployedShort?: string | null;
  tone?: string;
};

type ReaveDeployWindow = Window & {
  __reaveLastDeployIndicator?: DeployIndicatorPayload | null;
  __reaveLastDeployIndicatorReady?: boolean;
};

function messagePlainText(
  message:
    | { content?: ReadonlyArray<{ type: string; text?: string }> }
    | null
    | undefined,
): string {
  return (message?.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
}

function lastUserMessageText(
  messages: ReadonlyArray<{ role: string; content?: ReadonlyArray<{ type: string; text?: string }> }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'user') continue;
    return messagePlainText(messages[i]);
  }
  return '';
}

/** True when `text` is just the last already-sent user bubble — not an unsent draft. */
function isSentComposerEcho(text: string, lastUserText: string): boolean {
  const a = text.trim();
  return Boolean(a) && a === lastUserText.trim();
}

function readDeployChatDraftsMap(): Record<string, DeployChatDraftEntry> {
  try {
    const raw = sessionStorage.getItem(DEPLOY_CHAT_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DeployChatDraftPayload | Record<string, DeployChatDraftEntry>;
    if (!parsed || typeof parsed !== 'object') return {};
    // Legacy single-draft shape from the first deploy-lock snapshot.
    if ('threadId' in parsed && typeof parsed.threadId === 'string' && typeof parsed.text === 'string') {
      return {
        [parsed.threadId]: {
          text: parsed.text,
          ...(parsed.autoSend ? { autoSend: true } : {}),
        },
      };
    }
    const out: Record<string, DeployChatDraftEntry> = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, DeployChatDraftEntry>)) {
      if (entry && typeof entry.text === 'string') {
        out[id] = {
          text: entry.text,
          ...(entry.autoSend ? { autoSend: true } : {}),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeDeployChatDraftsMap(map: Record<string, DeployChatDraftEntry>): void {
  try {
    if (Object.keys(map).length === 0) {
      sessionStorage.removeItem(DEPLOY_CHAT_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(DEPLOY_CHAT_DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota */
  }
}

function readDeployChatDraftPayload(threadId: string): DeployChatDraftPayload | null {
  const entry = readDeployChatDraftsMap()[threadId];
  if (!entry) return null;
  return { threadId, text: entry.text, autoSend: entry.autoSend };
}

function saveDeployChatDraft(
  threadId: string,
  text: string,
  opts?: { autoSend?: boolean },
): void {
  try {
    // Never wipe a prior snapshot with an empty string (lock timing races).
    if (!text.trim()) return;
    const all = readDeployChatDraftsMap();
    const prev = all[threadId];
    const autoSend = opts?.autoSend ?? prev?.autoSend;
    all[threadId] = { text, ...(autoSend ? { autoSend: true } : {}) };
    writeDeployChatDraftsMap(all);
  } catch {
    /* private mode / quota */
  }
}

function readDeployChatDraft(threadId: string): string | null {
  return readDeployChatDraftPayload(threadId)?.text ?? null;
}

function clearDeployChatDraft(threadId?: string): void {
  try {
    if (!threadId) {
      sessionStorage.removeItem(DEPLOY_CHAT_DRAFT_KEY);
      return;
    }
    const all = readDeployChatDraftsMap();
    if (!(threadId in all)) return;
    delete all[threadId];
    writeDeployChatDraftsMap(all);
  } catch {
    /* private mode */
  }
}

function PendingDraftBoot({
  draft,
  autoSend,
  threadId,
  onQueuedChange,
}: {
  draft?: string | null;
  autoSend?: boolean;
  threadId: string;
  onQueuedChange?: (queued: boolean) => void;
}) {
  const composer = useComposerRuntime();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !draft) return;
    ran.current = true;
    composer.setText(draft);
    // Never auto-send here — lock state is unknown on first paint. Queue it
    // so DeployDraftBoot can hold through the deploy and flush when live.
    if (autoSend) {
      saveDeployChatDraft(threadId, draft, { autoSend: true });
      onQueuedChange?.(true);
    }
  }, [autoSend, composer, draft, onQueuedChange, threadId]);
  return null;
}

/** Rehydrate composer text saved across a deploy lock / post-deploy reload. */
function DeployDraftBoot({
  threadId,
  deployChatLocked,
  deployChatLockReady,
  skipRestore,
  onQueuedChange,
}: {
  threadId: string;
  deployChatLocked: boolean;
  deployChatLockReady: boolean;
  skipRestore?: boolean;
  onQueuedChange?: (queued: boolean) => void;
}) {
  const composer = useComposerRuntime();
  const lastUserText = useAuiState((s) => lastUserMessageText(s.thread.messages));
  const wasLockedRef = useRef(deployChatLocked);
  const didInitialRestoreRef = useRef(false);
  const flushedRef = useRef(false);

  // Snapshot while locked so the hard reload that follows "live" still has the draft.
  useLayoutEffect(() => {
    if (!deployChatLocked) return;
    const text = composer.getState().text ?? '';
    if (isSentComposerEcho(text, lastUserText)) {
      clearDeployChatDraft(threadId);
      onQueuedChange?.(false);
      return;
    }
    saveDeployChatDraft(threadId, text);
    if (readDeployChatDraftPayload(threadId)?.autoSend) onQueuedChange?.(true);
  }, [composer, deployChatLocked, lastUserText, onQueuedChange, threadId]);

  useEffect(() => {
    const wasLocked = wasLockedRef.current;
    wasLockedRef.current = deployChatLocked;

    // After a hard reload the runtime is empty — pull the snapshot back once,
    // including while still deploying so the editable field is not blank.
    if (!didInitialRestoreRef.current) {
      didInitialRestoreRef.current = true;
      if (!skipRestore) {
        const saved = readDeployChatDraftPayload(threadId);
        if (saved) {
          if (isSentComposerEcho(saved.text, lastUserText)) {
            clearDeployChatDraft(threadId);
            onQueuedChange?.(false);
          } else {
            const current = composer.getState().text ?? '';
            if (!current.trim()) composer.setText(saved.text);
            if (saved.autoSend) onQueuedChange?.(true);
            // Keep autoSend snapshots until the flush effect actually sends.
            else if (!deployChatLocked) clearDeployChatDraft(threadId);
          }
        }
      }
    }

    // In-session unlock (no reload): drop a regular typed snapshot. Queued
    // auto-sends stay until the flush effect below fires.
    if (wasLocked && !deployChatLocked && !readDeployChatDraftPayload(threadId)?.autoSend) {
      clearDeployChatDraft(threadId);
    }
  }, [composer, deployChatLocked, lastUserText, onQueuedChange, skipRestore, threadId]);

  // lastUserText can arrive after the first restore (thread hydrate). Drop
  // a snapshot that is only the message already in the transcript.
  useEffect(() => {
    if (!lastUserText.trim()) return;
    const current = composer.getState().text ?? '';
    if (isSentComposerEcho(current, lastUserText)) composer.setText('');
    const saved = readDeployChatDraftPayload(threadId);
    if (saved && isSentComposerEcho(saved.text, lastUserText)) {
      clearDeployChatDraft(threadId);
      onQueuedChange?.(false);
    }
  }, [composer, lastUserText, onQueuedChange, threadId]);

  // Holding pattern: once the deploy lock is known and clear, send a queued
  // project/email/client handoff that arrived while sending was paused.
  useEffect(() => {
    if (flushedRef.current || !deployChatLockReady || deployChatLocked) return;
    const saved = readDeployChatDraftPayload(threadId);
    if (!saved?.autoSend) return;
    const text = (composer.getState().text ?? '').trim() || saved.text.trim();
    if (!text || isSentComposerEcho(text, lastUserText)) {
      clearDeployChatDraft(threadId);
      onQueuedChange?.(false);
      return;
    }
    flushedRef.current = true;
    if (!(composer.getState().text ?? '').trim()) composer.setText(saved.text);
    clearDeployChatDraft(threadId);
    onQueuedChange?.(false);
    void composer.send();
  }, [
    composer,
    deployChatLockReady,
    deployChatLocked,
    lastUserText,
    onQueuedChange,
    threadId,
  ]);

  return null;
}

type DeployChatLockState = {
  locked: boolean;
  message: string | null;
  liveReloading?: boolean;
  ready: boolean;
};

function applyDeployChatLockPayload(
  deploy: DeployIndicatorPayload | null | undefined,
  opts: {
    wasLocked: boolean;
    setWasLocked: (locked: boolean) => void;
    setState: (next: DeployChatLockState) => void;
  },
): void {
  if (!deploy) {
    opts.setWasLocked(false);
    opts.setState({ locked: false, message: null, ready: true });
    return;
  }

  const locked = Boolean(deploy.chatLocked);
  const message = deploy.chatLockMessage ?? null;
  const deployedShort = deploy.deployedShort?.trim() || '';

  // Railway all-clear: drop the composer banner and reload onto the new build.
  // Regular users will not refresh on their own — and stale tabs keep old assets.
  if (opts.wasLocked && !locked) {
    if (deploy.tone === 'live' || deploy.state === 'live') playDeployDoneTone();
    let alreadyReloaded = false;
    try {
      alreadyReloaded = Boolean(
        deployedShort && sessionStorage.getItem(DEPLOY_CHAT_RELOAD_KEY) === deployedShort,
      );
      if (deployedShort) sessionStorage.setItem(DEPLOY_CHAT_RELOAD_KEY, deployedShort);
    } catch {
      /* private mode */
    }

    opts.setWasLocked(false);
    if (alreadyReloaded) {
      opts.setState({ locked: false, message: null, ready: true });
      return;
    }

    opts.setState({
      locked: true,
      liveReloading: true,
      ready: true,
      message: 'New version is live — reloading…',
    });
    window.setTimeout(() => {
      window.location.reload();
    }, 900);
    return;
  }

  opts.setWasLocked(locked);
  opts.setState({ locked, message, ready: true });
}

function readCachedDeployLock(): DeployChatLockState {
  if (typeof window === 'undefined') return { locked: false, message: null, ready: false };
  const w = window as ReaveDeployWindow;
  if (!w.__reaveLastDeployIndicatorReady) {
    return { locked: false, message: null, ready: false };
  }
  const deploy = w.__reaveLastDeployIndicator;
  if (!deploy) return { locked: false, message: null, ready: true };
  return {
    locked: Boolean(deploy.chatLocked),
    message: deploy.chatLockMessage ?? null,
    ready: true,
  };
}

function useDeployChatLock(): DeployChatLockState {
  const [state, setState] = useState<DeployChatLockState>(readCachedDeployLock);
  const wasLockedRef = useRef(state.locked);
  const lockedRef = useRef(state.locked);
  const reloadScheduledRef = useRef(false);

  const applyPayload = useCallback((deploy: DeployIndicatorPayload | null | undefined) => {
    if (reloadScheduledRef.current) return;
    const before = wasLockedRef.current;
    applyDeployChatLockPayload(deploy, {
      wasLocked: before,
      setWasLocked: (locked) => {
        wasLockedRef.current = locked;
      },
      setState: (next) => {
        const merged = { ...next, ready: true };
        lockedRef.current = Boolean(merged.locked);
        if (merged.liveReloading) reloadScheduledRef.current = true;
        setState(merged);
      },
    });
  }, []);

  const canPollDeployIndicator = useCallback(() => {
    // Owner-only endpoint (unless DEPLOY_STATUS_PUBLIC) — never hit it signed out / non-owner.
    if (typeof document === 'undefined') return false;
    const uid = document.body?.dataset?.userId?.trim();
    if (document.body?.dataset?.userId !== undefined && !uid) return false;
    if (document.body?.dataset?.isOwner === '1') return true;
    // Public marketing pages have no data-is-owner; rely on header events only.
    return false;
  }, []);

  const refresh = useCallback(async () => {
    if (reloadScheduledRef.current) return;
    if (!canPollDeployIndicator()) {
      applyPayload(null);
      return;
    }
    try {
      const res = await fetch('/api/deploy/indicator', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        applyPayload(null);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        deploy?: DeployIndicatorPayload | null;
      };
      if (!res.ok || !data.ok) {
        applyPayload(null);
        return;
      }
      applyPayload(data.deploy ?? null);
    } catch {
      // Keep the existing lock state on transient network errors so a blip
      // doesn't unlock the composer while a deploy is still in flight.
    }
  }, [applyPayload, canPollDeployIndicator]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (reloadScheduledRef.current || document.hidden || !canPollDeployIndicator()) return;
      const ms = lockedRef.current ? DEPLOY_CHAT_LOCK_POLL_MS_ACTIVE : DEPLOY_CHAT_LOCK_POLL_MS_IDLE;
      timer = setTimeout(() => {
        void refresh().finally(schedule);
      }, ms);
    };

    if (canPollDeployIndicator()) {
      void refresh().finally(schedule);
    } else {
      applyPayload(null);
    }

    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (!canPollDeployIndicator()) return;
      void refresh().finally(schedule);
    };

    // Header deploy bulb polls on the same endpoint — reuse its all-clear immediately.
    const onDeployEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<DeployIndicatorPayload | null>).detail;
      applyPayload(detail);
      schedule();
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('reave:deploy-indicator', onDeployEvent);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('reave:deploy-indicator', onDeployEvent);
    };
  }, [applyPayload, canPollDeployIndicator, refresh]);

  return state;
}

type ChatNavContextValue = {
  threadId: string | null;
  fromFocus: boolean;
};

const ChatNavContext = createContext<ChatNavContextValue>({ threadId: null, fromFocus: false });

function ChatMarkdownLink(props: { href?: string; children?: ReactNode }) {
  const { threadId, fromFocus } = useContext(ChatNavContext);
  const href = withChatReturnHref(props.href || '', threadId, { fromFocus });
  const { kind } = classifyChatButtonHref(href);
  if (kind === 'admin') {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          openChatButtonHref(href);
        }}
      >
        {props.children}
      </a>
    );
  }
  return <a {...props} href={href} />;
}

function AssistantTextPart(props: { text?: string; status?: { type?: string } }) {
  const isStreaming = props.status?.type === 'running';
  const { text, buttons } = useChatRenderer(props.text ?? '', { skipStructured: isStreaming });
  const { threadId, fromFocus } = useContext(ChatNavContext);

  if (isStreaming) {
    return text ? <span className="aui-text aui-text-streaming">{text}</span> : null;
  }

  return (
    <>
      {text ? (
        <MarkdownTextPrimitive
          remarkPlugins={[remarkGfm]}
          className="aui-md"
          preprocess={(raw) => parseAssistantChatButtons(raw).text}
          components={{ a: ChatMarkdownLink }}
        />
      ) : null}
      {buttons.length > 0 ? (
        <div className="aui-chat-buttons">
          {buttons.map((button, idx) => {
            const stamped = {
              ...button,
              href: withChatReturnHref(button.href, threadId, { fromFocus }),
            };
            return <ChatButton key={`${stamped.href}-${idx}`} {...getButtonProps(stamped)} />;
          })}
        </div>
      ) : null}
    </>
  );
}

function UserTextPart(props: { text?: string }) {
  const raw = props.text ?? '';
  const segments = splitMentionText(raw);
  if (!segments.some((seg) => seg.type === 'mention')) {
    return <span className="aui-text">{raw}</span>;
  }
  return (
    <span className="aui-text">
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={`t:${i}`}>{seg.value}</span>;
        const kind = seg.kind === 'user' ? 'team' : 'contact';
        return (
          <span
            key={`${kind}:${seg.id}:${i}`}
            className={`aui-mention-chip aui-mention-chip--${kind}`}
            title={kind === 'contact' ? `Contact ${seg.id}` : `Team ${seg.id}`}
          >
            @{seg.label}
          </span>
        );
      })}
    </span>
  );
}

type ChatLightboxApi = {
  open: (src: string, alt: string) => void;
  close: () => void;
  isOpen: boolean;
};

const ChatLightboxContext = createContext<ChatLightboxApi | null>(null);

function ChatLightboxProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<{ src: string; alt: string } | null>(null);
  const open = useCallback((src: string, alt: string) => setItem({ src, alt }), []);
  const close = useCallback(() => setItem(null), []);
  const api = useMemo(
    () => ({ open, close, isOpen: item !== null }),
    [open, close, item],
  );
  return (
    <ChatLightboxContext.Provider value={api}>
      {children}
      {item ? <ChatImageLightbox src={item.src} alt={item.alt} onClose={close} /> : null}
    </ChatLightboxContext.Provider>
  );
}

function ChatImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="aui-chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="aui-chat-lightbox-close"
        onClick={onClose}
        aria-label="Close image preview"
      >
        ×
      </button>
      <img
        className="aui-chat-lightbox-img"
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function ChatImagePreview({
  src,
  alt,
  className,
  thumb = false,
}: {
  src: string;
  alt: string;
  className?: string;
  thumb?: boolean;
}) {
  const lightbox = useContext(ChatLightboxContext);
  const [open, setOpen] = useState(false);
  const label = alt || 'Attached image';

  return (
    <>
      <button
        type="button"
        className={`aui-chat-img-btn${thumb ? ' aui-chat-img-btn--thumb' : ''}`}
        onClick={() => {
          if (lightbox) lightbox.open(src, label);
          else setOpen(true);
        }}
        aria-label={`View full size: ${label}`}
      >
        <img className={className} src={src} alt={label} loading="lazy" />
      </button>
      {!lightbox && open ? (
        <ChatImageLightbox src={src} alt={label} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function UserImagePart(props: { image?: string; alt?: string }) {
  if (!props.image) return null;
  return (
    <ChatImagePreview
      src={props.image}
      alt={props.alt || 'Attached image'}
      className="aui-msg-img"
    />
  );
}

function UserMessageImageAttachment() {
  const attachment = useAuiState((s) => s.attachment);
  const imagePart = attachment?.content?.find((part) => part.type === 'image');
  if (!imagePart || imagePart.type !== 'image') return null;
  return <UserImagePart image={imagePart.image} alt={attachment?.name} />;
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h7.17a2 2 0 0 1 1.41.59l3.83 3.83A2 2 0 0 1 19 7.83V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM6 3.5a.5.5 0 0 0-.5.5v16a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V8.5h-4a1 1 0 0 1-1-1v-4H6Z"
      />
    </svg>
  );
}

function UserFileChip(props: { filename?: string; mimeType?: string }) {
  return (
    <div className="aui-file-chip">
      <FileIcon />
      <div className="aui-file-chip-meta">
        <span className="aui-file-chip-name">{props.filename || 'Attachment'}</span>
        <span className="aui-file-chip-type">{fileLabelForMimeType(props.mimeType)}</span>
      </div>
    </div>
  );
}

function UserFilePart(props: { filename?: string; mimeType?: string }) {
  return <UserFileChip filename={props.filename} mimeType={props.mimeType} />;
}

function UserMessageFileAttachment() {
  const attachment = useAuiState((s) => s.attachment);
  const filePart = attachment?.content?.find((part) => part.type === 'file');
  if (!filePart || filePart.type !== 'file') return null;
  return <UserFileChip filename={attachment?.name} mimeType={filePart.mimeType} />;
}

function ComposerFileAttachmentPreview() {
  const attachment = useAuiState((s) => s.attachment);
  return (
    <div className="aui-composer-attachment aui-composer-attachment-file">
      <FileIcon />
      <span className="aui-composer-attachment-file-name">{attachment?.name}</span>
      <AttachmentPrimitive.Remove
        className="aui-composer-attachment-remove"
        aria-label="Remove attachment"
      >
        ×
      </AttachmentPrimitive.Remove>
    </div>
  );
}

function ComposerAttachmentPreview() {
  const attachment = useAuiState((s) => s.attachment);
  const file = attachment?.file;
  const previewSrc = useMemo(
    () => (file instanceof File ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewSrc) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  if (!previewSrc) return null;

  const alt = attachment?.name || 'Attached image';

  return (
    <div className="aui-composer-attachment">
      <ChatImagePreview src={previewSrc} alt={alt} className="aui-composer-attachment-thumb" thumb />
      <AttachmentPrimitive.Remove
        className="aui-composer-attachment-remove"
        aria-label="Remove attachment"
      >
        ×
      </AttachmentPrimitive.Remove>
    </div>
  );
}

function HelperCommandsPanel({
  commands,
  onPick,
  activeIdx = -1,
}: {
  commands: AgentHelperCommand[];
  onPick: (command: AgentHelperCommand) => void;
  activeIdx?: number;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);
  return (
    <div className="aui-helper-panel" onPointerDown={(e) => e.preventDefault()}>
      <ul className="aui-helper-list" role="listbox" aria-label="Helper commands">
        {commands.map((command, i) => (
          <li key={command.slash}>
            <button
              type="button"
              className={`aui-helper-item${i === activeIdx ? ' active' : ''}`}
              role="option"
              aria-selected={i === activeIdx}
              ref={i === activeIdx ? activeRef : undefined}
              onClick={() => onPick(command)}
            >
              <span className="aui-helper-item-slash">{command.slash}</span>
              <span className="aui-helper-item-summary">{command.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function peopleResultToMention(person: PeopleSearchResult): ChatMention {
  if (person.kind === 'contact') {
    return {
      kind: 'contact',
      uid: person.uid,
      name: sanitizeMentionLabel(person.name),
      email: person.email,
      company: person.company,
    };
  }
  return {
    kind: 'user',
    userId: person.userId,
    name: sanitizeMentionLabel(person.name),
    email: person.email,
  };
}

function mentionKindLabel(person: PeopleSearchResult): string {
  if (person.kind === 'user') return 'Team';
  return person.clientKind === 'proposed' ? 'Proposed' : 'Client';
}

function MentionsPanel({
  people,
  onPick,
  activeIdx = -1,
  loading = false,
}: {
  people: PeopleSearchResult[];
  onPick: (person: PeopleSearchResult) => void;
  activeIdx?: number;
  loading?: boolean;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);
  return (
    <div className="aui-helper-panel" onPointerDown={(e) => e.preventDefault()}>
      <ul className="aui-helper-list" role="listbox" aria-label="Mention people">
        {loading && people.length === 0 ? (
          <li className="aui-helper-empty">Searching…</li>
        ) : null}
        {!loading && people.length === 0 ? (
          <li className="aui-helper-empty">No people found</li>
        ) : null}
        {people.map((person, i) => {
          const key = person.kind === 'contact' ? `c:${person.uid}` : `u:${person.userId}`;
          return (
            <li key={key}>
              <button
                type="button"
                className={`aui-helper-item aui-mention-item${i === activeIdx ? ' active' : ''}`}
                role="option"
                aria-selected={i === activeIdx}
                ref={i === activeIdx ? activeRef : undefined}
                onClick={() => onPick(person)}
              >
                <span className="aui-mention-kind">{mentionKindLabel(person)}</span>
                <span className="aui-helper-item-slash">@{person.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useMentions(
  pendingMentionsRef: RefObject<ChatMention[]>,
  fieldRef: RefObject<ComposerFieldHandle | null>,
) {
  const composer = useComposerRuntime();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tokenStart, setTokenStart] = useState(-1);
  const [people, setPeople] = useState<PeopleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGen = useRef(0);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const showMentions = open && (loading || people.length > 0 || query.length >= 0);

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const closeMentions = useCallback(() => {
    clearBlurTimer();
    setOpen(false);
    setActiveIdx(-1);
  }, []);

  const focusInput = useCallback(() => {
    const handle = fieldRef.current;
    if (handle) {
      handle.focus();
      return;
    }
    const el = document.querySelector<HTMLElement>('#chat-panel .aui-input, .aui-root .aui-input');
    if (!(el instanceof HTMLElement)) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [fieldRef]);

  useEffect(() => () => clearBlurTimer(), []);

  useEffect(() => {
    if (!isRunning) return;
    closeMentions();
  }, [isRunning, closeMentions]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.aui-helper-panel, .aui-composer-shell, .aui-composer-card')) return;
      closeMentions();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeMentions]);

  useEffect(() => {
    if (!open) return;
    const gen = ++fetchGen.current;
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: '20' });
      if (query) params.set('q', query);
      void fetch(`/api/people?${params}`)
        .then(async (res) => {
          if (gen !== fetchGen.current) return;
          if (!res.ok) {
            setPeople([]);
            return;
          }
          const data = (await res.json()) as { ok?: boolean; people?: PeopleSearchResult[] };
          if (gen !== fetchGen.current) return;
          setPeople(Array.isArray(data.people) ? data.people : []);
        })
        .catch(() => {
          if (gen === fetchGen.current) setPeople([]);
        })
        .finally(() => {
          if (gen === fetchGen.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [query, open, people]);

  const applyPerson = (person: PeopleSearchResult) => {
    const handle = fieldRef.current;
    const value = handle?.getValue() ?? composer.getState().text ?? '';
    const caret = handle?.getCaret() ?? value.length;
    const active = activeMentionQueryAt(value, caret) ?? (tokenStart >= 0 ? { start: tokenStart, query } : null);
    if (!active) return;

    const mention = peopleResultToMention(person);
    const before = value.slice(0, active.start);
    const after = value.slice(caret);
    // Durable token embeds the UUID in composer state; the editor chips the label.
    const insert = `${serializeMentionToken(mention)} `;
    const next = `${before}${insert}${after}`;
    const nextCaret = before.length + insert.length;

    const prev = pendingMentionsRef.current ?? [];
    const key = mentionKey(mention);
    const withoutDup = prev.filter((m) => mentionKey(m) !== key);
    pendingMentionsRef.current = [...withoutDup, mention];

    composer.setText(next);
    closeMentions();
    focusInput();
    requestAnimationFrame(() => {
      handle?.focus();
      handle?.setCaret(nextCaret);
    });
  };

  const onInput = (value: string, caret: number) => {
    // Slash helpers own the whole string when it starts with `/`.
    if (value.startsWith('/')) {
      closeMentions();
      return;
    }
    const active = activeMentionQueryAt(value, caret);
    if (!active) {
      closeMentions();
      return;
    }
    clearBlurTimer();
    setTokenStart(active.start);
    setQuery(active.query);
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!showMentions || !open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = people.length;
      if (n === 0) return true;
      setActiveIdx((idx) => {
        if (e.key === 'ArrowDown') return idx < 0 ? 0 : (idx + 1) % n;
        return idx <= 0 ? n - 1 : idx - 1;
      });
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMentions();
      return true;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const pick = activeIdx >= 0 ? people[activeIdx] : people[0];
      if (pick) {
        e.preventDefault();
        applyPerson(pick);
        return true;
      }
    }
    return false;
  };

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (isComposerFocusTarget(e.relatedTarget)) return;
    clearBlurTimer();
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (isComposerFocusTarget(document.activeElement)) return;
      closeMentions();
    }, 120);
  };

  const onFocus = () => clearBlurTimer();

  return {
    showMentions: open,
    people,
    loading,
    activeIdx,
    applyPerson,
    onInput,
    onKeyDown,
    onBlur,
    onFocus,
    closeMentions,
  };
}

const COMPOSER_FOCUS_SELECTOR = '.aui-composer-shell, .aui-composer-card, .aui-helper-panel';

function isComposerFocusTarget(el: Element | null | undefined): boolean {
  return el instanceof HTMLElement && Boolean(el.closest(COMPOSER_FOCUS_SELECTOR));
}

function useSlashHelpers(
  propsRef: RefObject<AgentChatPanelProps>,
  commands: AgentHelperCommand[],
  fieldRef: RefObject<ComposerFieldHandle | null>,
  sendBlocked = false,
) {
  const composer = useComposerRuntime();
  const [composeText, setComposeText] = useState('');
  const [helpersOpen, setHelpersOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const filtered = filterHelperCommands(composeText, commands);
  const showHelpers = helpersOpen && filtered.length > 0;

  useEffect(() => {
    setActiveIdx(-1);
  }, [composeText, helpersOpen]);

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const openHelpers = () => {
    clearBlurTimer();
    setHelpersOpen(true);
  };

  const scheduleBlurSideEffects = () => {
    clearBlurTimer();
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (isComposerFocusTarget(document.activeElement)) return;
      setHelpersOpen(false);
      propsRef.current?.onComposeFocus?.(false);
    }, 120);
  };

  const focusInput = useCallback(() => {
    const handle = fieldRef.current;
    if (handle) {
      handle.focus();
      return;
    }
    const el = document.querySelector<HTMLElement>('#chat-panel .aui-input, .aui-root .aui-input');
    if (!(el instanceof HTMLElement)) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [fieldRef]);

  const applyCommand = (command: AgentHelperCommand) => {
    composer.setText(command.template);
    setComposeText(command.template);
    clearBlurTimer();
    setHelpersOpen(false);
    focusInput();
  };

  useEffect(() => () => clearBlurTimer(), []);

  useEffect(() => {
    if (!isRunning) return;
    setHelpersOpen(false);
    setComposeText('');
    propsRef.current?.onComposeDirty?.(false);
  }, [isRunning]);

  useEffect(() => {
    if (!helpersOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.aui-helper-panel, .aui-composer-shell, .aui-composer-card')) return;
      setHelpersOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [helpersOpen]);

  const onFocus = () => {
    clearBlurTimer();
    if (composeText.startsWith('/')) openHelpers();
    propsRef.current?.onComposeFocus?.(true);
  };

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (isComposerFocusTarget(e.relatedTarget)) return;
    scheduleBlurSideEffects();
  };

  const onInput = (value: string) => {
    setComposeText(value);
    propsRef.current?.onComposeDirty?.(value.trim().length > 0);
    if (value.startsWith('/')) {
      openHelpers();
      return;
    }
    setHelpersOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (showHelpers && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const n = filtered.length;
      setActiveIdx((idx) => {
        if (n === 0) return -1;
        if (e.key === 'ArrowDown') return idx < 0 ? 0 : (idx + 1) % n;
        return idx <= 0 ? n - 1 : idx - 1;
      });
      return;
    }
    if (showHelpers && e.key === 'Escape') {
      e.preventDefault();
      setHelpersOpen(false);
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!sendBlocked && composer.getState().canSend) void composer.send();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (showHelpers && activeIdx >= 0 && filtered[activeIdx]) {
      e.preventDefault();
      applyCommand(filtered[activeIdx]);
      return;
    }
    e.preventDefault();
    const matched = matchHelperCommand(composeText, commands);
    if (matched && composeText.trim().toLowerCase() === matched.slash) {
      composer.setText(matched.template);
      if (!sendBlocked) void composer.send();
      return;
    }
    if (!sendBlocked && composer.getState().canSend) void composer.send();
  };

  return {
    filtered,
    showHelpers,
    activeIdx,
    applyCommand,
    onFocus,
    onBlur,
    onInput,
    onKeyDown,
    focusInput,
  };
}

/** Pack glyphs: IOS_ICONS.send / paperclip — keep in sync with public/admin/admin-ui.js */
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.586-8.414" />
    </svg>
  );
}

function ComposerStopButton({
  threadId,
  useExternalProgress,
  onStopExternal,
}: {
  threadId: string;
  useExternalProgress: boolean;
  onStopExternal?: () => void;
}) {
  if (useExternalProgress) {
    return (
      <button
        type="button"
        className="aui-composer-stop"
        aria-label="Stop generating"
        onClick={() => onStopExternal?.()}
      >
        Stop
      </button>
    );
  }
  return (
    <ComposerPrimitive.Cancel
      className="aui-composer-stop"
      aria-label="Stop generating"
      // Cancelling only ends the local stream; without this the run keeps
      // working server-side and the thread later gains a reply the user
      // already told us to abandon.
      onClick={() => {
        void fetch(`/api/chats/${encodeURIComponent(threadId)}/cancel`, {
          method: 'POST',
        }).catch(() => {});
      }}
    >
      Stop
    </ComposerPrimitive.Cancel>
  );
}

/**
 * If the reply is already on screen but assistant-ui still says the turn is
 * running (lost `done` event, iOS holding the SSE socket), drop the local lock
 * once the server confirms the run is gone — including when the user leaves
 * and comes back. A stuck `isRunning` used to skip recovery on that path.
 */
function useReleaseStuckRun(
  threadId: string,
  showRunning: boolean,
  deployChatLocked: boolean,
  useExternalProgress: boolean,
  replyOnScreen: boolean,
  onStopExternal?: () => void,
) {
  const runtime = useThreadRuntime();
  const idleStreakRef = useRef(0);

  const dropLocalRun = useCallback(() => {
    if (useExternalProgress) {
      onStopExternal?.();
      return;
    }
    try {
      runtime.cancelRun();
    } catch {
      /* already idle */
    }
  }, [onStopExternal, runtime, useExternalProgress]);

  const releaseIfIdle = useCallback(
    async (opts?: { immediate?: boolean }) => {
      if (!showRunning || deployChatLocked) return;
      const status = await fetchRunProgress(threadId);
      const serverIdle = Boolean(status) && !isChatRunActive(status);
      if (opts?.immediate) {
        if (serverIdle || (replyOnScreen && !status)) dropLocalRun();
        idleStreakRef.current = 0;
        return;
      }
      if (!serverIdle) {
        idleStreakRef.current = 0;
        return;
      }
      idleStreakRef.current += 1;
      if (idleStreakRef.current < 2 && !replyOnScreen) return;
      idleStreakRef.current = 0;
      dropLocalRun();
    },
    [deployChatLocked, dropLocalRun, replyOnScreen, showRunning, threadId],
  );

  useEffect(() => {
    if (!showRunning || deployChatLocked) {
      idleStreakRef.current = 0;
      return;
    }
    const id = window.setInterval(() => void releaseIfIdle(), 2_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void releaseIfIdle({ immediate: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [deployChatLocked, releaseIfIdle, showRunning]);

  return { releaseIfIdle, dropLocalRun };
}

function ClaudeComposer({
  propsRef,
  commands,
  pendingMentionsRef,
  onFocusInputReady,
  centered = false,
  threadId,
  externalProgress,
  useExternalProgress,
  streamedProgress,
  onStopExternal,
  deployChatLocked = false,
  deployChatLockMessage = null,
  deployLiveReloading = false,
  queuedSend = false,
  onQueuedChange,
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  commands: AgentHelperCommand[];
  pendingMentionsRef: RefObject<ChatMention[]>;
  onFocusInputReady?: (focus: () => void) => void;
  centered?: boolean;
  threadId: string;
  externalProgress?: AgentProgress | null;
  useExternalProgress?: boolean;
  streamedProgress?: AgentProgress | null;
  onStopExternal?: () => void;
  deployChatLocked?: boolean;
  deployChatLockMessage?: string | null;
  deployLiveReloading?: boolean;
  queuedSend?: boolean;
  onQueuedChange?: (queued: boolean) => void;
}) {
  const fieldRef = useRef<ComposerFieldHandle | null>(null);
  const composer = useComposerRuntime();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const lastAssistantText = useAuiState((s) => lastAssistantMessageText(s.thread.messages));
  const replyOnScreen = lastAssistantText.trim().length > 0;
  const showRunning = isRunning || Boolean(useExternalProgress);
  // ComposerPrimitive.Send is itself disabled while isRunning. Once a reply is
  // visible, do not hard-lock our button — the user can interrupt and send.
  const sendBlocked = deployChatLocked || queuedSend || (showRunning && !replyOnScreen);
  const canInterruptSend = showRunning && replyOnScreen && !deployChatLocked && !queuedSend;
  const { elapsed } = useAgentRunStatus(
    threadId,
    externalProgress ?? null,
    Boolean(useExternalProgress),
    streamedProgress ?? null,
  );
  const { releaseIfIdle, dropLocalRun } = useReleaseStuckRun(
    threadId,
    showRunning,
    deployChatLocked,
    Boolean(useExternalProgress),
    replyOnScreen,
    onStopExternal,
  );
  const interruptAndSend = useCallback(() => {
    dropLocalRun();
    void fetch(`/api/chats/${encodeURIComponent(threadId)}/cancel`, { method: 'POST' }).catch(
      () => {},
    );
    if (composer.getState().canSend) void composer.send();
  }, [composer, dropLocalRun, threadId]);
  const helpers = useSlashHelpers(propsRef, commands, fieldRef, sendBlocked);
  const mentions = useMentions(pendingMentionsRef, fieldRef);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);
  const sentByTouchRef = useRef(false);
  /** Last typed value — survives a post-deploy reload if runtime text is briefly empty. */
  const typedDraftRef = useRef('');
  const lastUserText = useAuiState((s) => lastUserMessageText(s.thread.messages));
  useCapComposerAttachments();

  useEffect(() => {
    onFocusInputReady?.(helpers.focusInput);
  }, [helpers.focusInput, onFocusInputReady]);

  // Snapshot the current draft when sending locks so a post-deploy reload
  // can restore it. Keystrokes while locked are saved in onInput.
  useLayoutEffect(() => {
    if (!deployChatLocked) return;
    const fromRuntime = composer.getState().text ?? '';
    const fallback = typedDraftRef.current || readDeployChatDraft(threadId) || '';
    const candidate = fromRuntime || fallback;
    if (isSentComposerEcho(candidate, lastUserText)) {
      typedDraftRef.current = '';
      clearDeployChatDraft(threadId);
      onQueuedChange?.(false);
      if (fromRuntime.trim()) composer.setText('');
      return;
    }
    if (candidate && !fromRuntime) composer.setText(candidate);
    typedDraftRef.current = candidate;
    saveDeployChatDraft(threadId, candidate);
  }, [composer, deployChatLocked, lastUserText, onQueuedChange, threadId]);

  // iOS Safari blurs the focused textarea on the touch that targets Send —
  // often before `click` — which closes the keyboard and reflows the pinned
  // composer enough that the tap never lands. A non-passive touchstart both
  // blocks that blur and sends immediately.
  useLayoutEffect(() => {
    if (sendBlocked) return;
    const btn = sendBtnRef.current;
    if (!btn) return;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (!composer.getState().canSend) return;
      sentByTouchRef.current = true;
      if (canInterruptSend) interruptAndSend();
      else void composer.send();
    };
    btn.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => btn.removeEventListener('touchstart', onTouchStart);
  }, [canInterruptSend, composer, interruptAndSend, sendBlocked]);

  return (
    <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
      {deployChatLocked ? (
        <div
          className={`aui-composer-deploy-lock${deployLiveReloading ? ' aui-composer-deploy-lock--live' : ''}`}
          role="status"
        >
          <span className="aui-composer-deploy-lock-icon" aria-hidden="true">
            {deployLiveReloading ? '🟢' : '🚀'}
          </span>
          <p className="aui-composer-deploy-lock-text">
            {deployLiveReloading
              ? deployChatLockMessage || 'New version is live — reloading…'
              : queuedSend
                ? (
                    deployChatLockMessage ||
                    'Deploy in progress — sending is paused until the new version is live.'
                  ).replace('sending is paused until', 'holding this send until')
                : deployChatLockMessage ||
                  'Deploy in progress — sending is paused until the new version is live.'}
          </p>
        </div>
      ) : null}
      {centered && showRunning ? (
        <AgentRunStatus
          threadId={threadId}
          externalProgress={externalProgress ?? null}
          useExternalProgress={Boolean(useExternalProgress)}
          streamedProgress={streamedProgress ?? null}
        />
      ) : null}
      {mentions.showMentions ? (
        <MentionsPanel
          people={mentions.people}
          onPick={mentions.applyPerson}
          activeIdx={mentions.activeIdx}
          loading={mentions.loading}
        />
      ) : helpers.showHelpers ? (
        <HelperCommandsPanel
          commands={helpers.filtered}
          onPick={helpers.applyCommand}
          activeIdx={helpers.activeIdx}
        />
      ) : null}
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-dropzone">
        <ComposerPrimitive.Root className="aui-composer-card">
          <AuiIf condition={(s) => s.composer.attachments.length > 0}>
            <div className="aui-composer-attachments">
              <ComposerPrimitive.Attachments
                components={{ Image: ComposerAttachmentPreview, File: ComposerFileAttachmentPreview }}
              />
            </div>
          </AuiIf>
          <ComposerMentionInput
            handleRef={fieldRef}
            className="aui-input"
            placeholder="How can I help you today?"
            enterKeyHint={sendBlocked ? 'enter' : 'send'}
            onFocus={() => {
              helpers.onFocus();
              mentions.onFocus();
            }}
            onBlur={(e) => {
              helpers.onBlur(e);
              mentions.onBlur(e);
            }}
            onInput={(value, caret) => {
              typedDraftRef.current = value;
              if (!value.trim()) {
                clearDeployChatDraft(threadId);
                onQueuedChange?.(false);
              } else if (deployChatLocked) saveDeployChatDraft(threadId, value);
              if (showRunning && !deployChatLocked) void releaseIfIdle();
              helpers.onInput(value);
              mentions.onInput(value, caret);
            }}
            onKeyDown={(e) => {
              if (mentions.onKeyDown(e)) return;
              helpers.onKeyDown(e);
            }}
          />
          <div className="aui-composer-toolbar">
            <ComposerPrimitive.AddAttachment
              className="aui-composer-attach"
              aria-label="Attach images, SVGs, PDFs, or PowerPoint files"
              multiple
            >
              <AttachIcon />
            </ComposerPrimitive.AddAttachment>
            <span className="aui-composer-hint">
              {queuedSend
                ? 'Queued — this will send when the new version is live'
                : deployChatLocked
                  ? 'Keep typing — send unlocks when the new version is live'
                  : canInterruptSend
                    ? 'Send now — this stops the current turn'
                    : showRunning
                      ? `Keep typing — send unlocks when the agent finishes · ${elapsed}`
                      : 'Type @ to mention · / for commands · paste or drag images, SVGs, PDFs, or PowerPoint files'}
            </span>
            <span className="aui-composer-actions">
              {showRunning ? (
                <ComposerStopButton
                  threadId={threadId}
                  useExternalProgress={Boolean(useExternalProgress)}
                  onStopExternal={onStopExternal}
                />
              ) : null}
              {sendBlocked ? (
                <button
                  type="button"
                  className="aui-composer-send"
                  aria-label={
                    queuedSend
                      ? 'Send queued until the new version is live'
                      : deployChatLocked
                        ? 'Send paused until the new version is live'
                        : 'Send paused until the agent finishes'
                  }
                  disabled
                >
                  <SendIcon />
                </button>
              ) : canInterruptSend ? (
                <button
                  ref={sendBtnRef}
                  type="button"
                  className="aui-composer-send"
                  aria-label="Stop the current turn and send"
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    if (sentByTouchRef.current) {
                      sentByTouchRef.current = false;
                      e.preventDefault();
                      return;
                    }
                    interruptAndSend();
                  }}
                >
                  <SendIcon />
                </button>
              ) : (
                <ComposerPrimitive.Send
                  ref={sendBtnRef}
                  className="aui-composer-send"
                  aria-label="Send message"
                  // Desktop / stylus: keep focus so the composer doesn't reflow before
                  // click. Touch send is handled by the non-passive touchstart listener
                  // above (React's synthetic preventDefault is often too late on iOS).
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    if (!sentByTouchRef.current) return;
                    sentByTouchRef.current = false;
                    // Already sent in touchstart — block ComposerPrimitive.Send's click send.
                    e.preventDefault();
                  }}
                >
                  <SendIcon />
                </ComposerPrimitive.Send>
              )}
            </span>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.AttachmentDropzone>
    </div>
  );
}

function UserChatMessage() {
  return (
    <ChatMessageShell align="user" bubbleClassName="aui-msg aui-msg-user">
      <MessagePrimitive.Parts
        components={{
          Text: UserTextPart,
          Image: UserImagePart,
          File: UserFilePart,
        }}
      />
      <MessagePrimitive.Attachments
        components={{ Image: UserMessageImageAttachment, File: UserMessageFileAttachment }}
      />
    </ChatMessageShell>
  );
}

function AssistantChatMessage() {
  return (
    <ChatMessageShell align="assistant" bubbleClassName="aui-msg aui-msg-assistant">
      <MessagePrimitive.Parts
        components={{
          Text: AssistantTextPart,
        }}
      />
    </ChatMessageShell>
  );
}

/** Stable identities — inline factories remount every thinking tick and close image previews. */
const THREAD_MESSAGE_COMPONENTS = {
  UserMessage: UserChatMessage,
  AssistantMessage: AssistantChatMessage,
};

function ChatMessages() {
  return <ThreadPrimitive.Messages components={THREAD_MESSAGE_COMPONENTS} />;
}

function storedMessagesKey(messages: readonly StoredChatMessage[]): string {
  return messages.map((m) => `${m.role}:${m.content}`).join('\n---\n');
}

/**
 * Pull persisted messages into the live runtime. Never remount the React tree —
 * that aborts the composer, closes lightboxes, and steals the caret.
 */
function PersistedMessageImporter({
  generation,
  propsRef,
}: {
  generation: number;
  propsRef: RefObject<AgentChatPanelProps>;
}) {
  const runtime = useThreadRuntime();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const applied = useRef(0);
  const lastKey = useRef(storedMessagesKey(propsRef.current?.initialMessages ?? []));

  useEffect(() => {
    if (!generation || generation === applied.current) return;
    applied.current = generation;
    if (isRunning) return;
    const messages = propsRef.current?.initialMessages ?? [];
    const key = storedMessagesKey(messages);
    if (key === lastKey.current) return;
    lastKey.current = key;
    runtime.reset(messages.map(storedToThreadMessage));
  }, [generation, isRunning, propsRef, runtime]);

  return null;
}

/** Poll cadence while following a server-side run vs. while idle. */
const RECOVERY_ACTIVE_POLL_MS = 900;
const RECOVERY_IDLE_POLL_MS = 5_000;
/** One empty poll is often a heartbeat gap — wait twice before tearing the run down. */
const RECOVERY_IDLE_CONFIRM_POLLS = 2;

/**
 * Adopt a run that this tab is not streaming.
 *
 * Covers the cases where the browser is not the one holding the stream: the chat
 * was reopened while a run is still going, the SSE connection was killed by the
 * OS or a proxy, or the process that owned the run died. Polling continues for as
 * long as the panel is mounted (slowly when idle) so a turn that loses its stream
 * gets picked back up instead of sitting on a spinner, and a turn whose run
 * disappeared entirely gets closed out with a note.
 */
function useRecoverInFlightRun(
  threadId: string,
  propsRef: RefObject<AgentChatPanelProps>,
  localRunning: boolean,
  onLocalRunAbandoned?: () => void,
) {
  const [recovering, setRecovering] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<AgentProgress | null>(null);
  const [recoveryText, setRecoveryText] = useState('');
  const recoveringRef = useRef(false);
  const localRunningRef = useRef(localRunning);
  localRunningRef.current = localRunning;
  const onLocalRunAbandonedRef = useRef(onLocalRunAbandoned);
  onLocalRunAbandonedRef.current = onLocalRunAbandoned;

  const stopRecovery = useCallback(async () => {
    try {
      await fetch(`/api/chats/${encodeURIComponent(threadId)}/cancel`, { method: 'POST' });
    } catch {
      /* ignore */
    }
    recoveringRef.current = false;
    setRecovering(false);
    setRecoveryProgress(null);
    setRecoveryText('');
    propsRef.current?.onAgentRunChange?.(false);
    await propsRef.current?.onRefreshMessages?.();
  }, [propsRef, threadId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let checkedForOrphanedTurn = false;
    let idleStreak = 0;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };

    /**
     * Heal a thread that was already broken when we opened it: a question with no
     * answer and no run behind it, left by a crash, a deploy, or a send that
     * failed while offline. Checked once, since it needs to read the thread.
     */
    const healOrphanedTurn = async () => {
      if (checkedForOrphanedTurn) return;
      checkedForOrphanedTurn = true;
      const reply = await fetchPersistedReply(threadId);
      if (cancelled || reply?.trim()) return;
      const note = await reconcileDeadTurn(threadId);
      if (cancelled || !note) return;
      await propsRef.current?.onRefreshMessages?.();
    };

    const finishRecovery = async () => {
      recoveringRef.current = false;
      setRecovering(false);
      setRecoveryProgress(null);
      setRecoveryText('');
      propsRef.current?.onAgentRunChange?.(false);
      playChatDoneTone();
      await propsRef.current?.onRefreshMessages?.();
    };

    const poll = async () => {
      // While this tab is streaming the run itself, the adapter owns the UI (and
      // has its own recovery); a second spinner here would just duplicate it.
      // Exception: a stuck local `isRunning` after the server already finished
      // used to skip this poll forever — leaving the app and coming back
      // never unlocked Send.
      if (localRunningRef.current) {
        const status = await fetchRunProgress(threadId);
        if (cancelled) return;
        if (status && !isChatRunActive(status)) onLocalRunAbandonedRef.current?.();
        schedule(RECOVERY_IDLE_POLL_MS);
        return;
      }

      const status = await fetchRunProgress(threadId);
      if (cancelled) return;

      const active = isChatRunActive(status);
      if (active && status) {
        idleStreak = 0;
        checkedForOrphanedTurn = true;
        if (!recoveringRef.current) {
          recoveringRef.current = true;
          setRecovering(true);
          propsRef.current?.onAgentRunChange?.(true);
        }
        if (status.progress) {
          setRecoveryProgress((prev) =>
            sameAgentProgressUi(prev, status.progress) ? prev : status.progress,
          );
          if (status.progress.partialText) {
            const next = status.progress.partialText;
            setRecoveryText((prev) => (prev === next ? prev : next));
          }
        }
        schedule(RECOVERY_ACTIVE_POLL_MS);
        return;
      }

      if (recoveringRef.current) {
        idleStreak += 1;
        if (idleStreak < RECOVERY_IDLE_CONFIRM_POLLS) {
          schedule(RECOVERY_ACTIVE_POLL_MS);
          return;
        }
        idleStreak = 0;
        // The run we were following ended: pull its persisted reply in, and if it
        // left none, have the server close the turn out.
        const persisted = await fetchPersistedReply(threadId);
        if (!persisted?.trim()) await reconcileDeadTurn(threadId);
        if (cancelled) return;
        await finishRecovery();
      } else {
        await healOrphanedTurn();
        if (cancelled) return;
      }
      schedule(RECOVERY_IDLE_POLL_MS);
    };

    void poll();

    // Returning to a backgrounded tab is exactly when a stream has usually died.
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule(0);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [propsRef, threadId]);

  return { recovering, recoveryProgress, recoveryText, stopRecovery };
}

function lastAssistantMessageText(
  messages: ReadonlyArray<{ role: string; content?: ReadonlyArray<{ type: string; text?: string }> }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    return messagePlainText(message);
  }
  return '';
}

function scrollAnchorIntoView(anchor: HTMLElement | null) {
  if (!anchor) return;
  const viewport = anchor.closest('.aui-viewport');
  if (viewport instanceof HTMLElement) {
    viewport.scrollTop = viewport.scrollHeight;
    return;
  }
  anchor.scrollIntoView({ block: 'end' });
}

/**
 * Keep the viewport pinned to the latest content while the agent streams —
 * but only while the user is already near the bottom. Scrolling up to read
 * history pauses follow until they return near the bottom (or a new run starts
 * via ThreadPrimitive.Viewport's scrollToBottomOnRunStart).
 */
function ChatFollowBottom({
  followActive,
  recoveryText,
}: {
  followActive: boolean;
  recoveryText: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useThreadViewport((s) => s.isAtBottom);
  const followPinnedRef = useRef(true);
  const lastAssistantText = useAuiState((s) => lastAssistantMessageText(s.thread.messages));
  const messageCount = useAuiState((s) => s.thread.messages.length);

  // Sync pin from the library's at-bottom flag, and watch native scroll so a
  // mid-stream wheel/touch immediately unpins before the next token re-centers.
  useEffect(() => {
    if (isAtBottom) followPinnedRef.current = true;
  }, [isAtBottom]);

  useEffect(() => {
    const viewport = anchorRef.current?.closest('.aui-viewport');
    if (!(viewport instanceof HTMLElement)) return;

    const NEAR_BOTTOM_PX = 80;
    const onScroll = () => {
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      followPinnedRef.current = distance <= NEAR_BOTTOM_PX;
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [messageCount]);

  useLayoutEffect(() => {
    if (!followPinnedRef.current) return;
    if (!followActive && !recoveryText) return;
    scrollAnchorIntoView(anchorRef.current);
  }, [followActive, isAtBottom, lastAssistantText, messageCount, recoveryText]);

  useEffect(() => {
    const viewport = anchorRef.current?.closest('.aui-viewport');
    if (!viewport || !followActive) return;

    let frame: number | null = null;
    const schedule = () => {
      if (!followPinnedRef.current) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!followPinnedRef.current) return;
        scrollAnchorIntoView(anchorRef.current);
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [followActive, lastAssistantText]);

  return <div ref={anchorRef} className="aui-scroll-anchor" aria-hidden="true" />;
}

function InFlightRecoveryMessage({ text }: { text: string }) {
  return (
    <div className="aui-msg-row aui-msg-row-assistant">
      <div className="aui-msg-wrap aui-msg-wrap-assistant">
        <div className="aui-msg aui-msg-assistant aui-msg-recovering">
          {text.trim() ? (
            <span className="aui-text aui-recovery-text">{text}</span>
          ) : (
            <span className="aui-text aui-text-muted">Waiting for response…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentChatThreadBody({
  propsRef,
  threadId,
  streamedProgress,
  deployChatLock,
  pendingMentionsRef,
  queuedSend,
  onQueuedChange,
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  threadId: string;
  streamedProgress: AgentProgress | null;
  deployChatLock: DeployChatLockState;
  pendingMentionsRef: RefObject<ChatMention[]>;
  queuedSend: boolean;
  onQueuedChange: (queued: boolean) => void;
}) {
  const [commands, setCommands] = useState<AgentHelperCommand[]>([]);
  const [welcomeGreeting] = useState(() => pickChatWelcomeGreeting());
  const focusComposerRef = useRef<(() => void) | null>(null);
  const autoFocusDoneRef = useRef(false);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const runtime = useThreadRuntime();
  const abandonStuckLocalRun = useCallback(() => {
    try {
      runtime.cancelRun();
    } catch {
      /* already idle */
    }
  }, [runtime]);
  const { recovering, recoveryProgress, recoveryText, stopRecovery } = useRecoverInFlightRun(
    threadId,
    propsRef,
    isRunning,
    abandonStuckLocalRun,
  );
  const lightbox = useContext(ChatLightboxContext);
  const lightboxOpen = Boolean(lightbox?.isOpen);
  const showThreadStatus = isRunning || recovering;
  const inFlightAssistantText = useAuiState((s) =>
    s.thread.isRunning ? lastAssistantMessageText(s.thread.messages) : '',
  );
  const showInThreadStatus = showThreadStatus && !recoveryText.trim() && !inFlightAssistantText.trim();
  const followActive = showThreadStatus && !lightboxOpen;

  const onFocusInputReady = useCallback(
    (focus: () => void) => {
      focusComposerRef.current = focus;
      if (autoFocusDoneRef.current) return;
      if (!propsRef.current?.autoFocusComposer) return;
      // Auto-send drafts should not steal focus / open the keyboard.
      if (propsRef.current?.pendingAutoSend) return;
      if (queuedSend) return;
      autoFocusDoneRef.current = true;
      // Double rAF: wait until the textarea is committed and laid out. On mobile,
      // a keyboard bridge may already be focused from the new-chat tap; focusing
      // the real input transfers that activation so the keypad can stay open.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focus();
        });
      });
    },
    [propsRef, queuedSend],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/chats/commands', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { commands?: { slash: string; summary: string; template: string }[] } | null) => {
        if (cancelled || !data?.commands) return;
        setCommands(
          data.commands.map((cmd) => ({
            slash: cmd.slash,
            summary: cmd.summary,
            template: cmd.template,
            label: cmd.slash.replace(/^\//, ''),
            steps: [],
            example: cmd.template,
            feature: 'core' as const,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThreadPrimitive.Root className="aui-thread">
      <AuiIf condition={(s) => s.thread.messages.length === 0}>
        <div className="aui-empty-state">
          <h1 className="aui-empty-heading">{welcomeGreeting}</h1>
          <ClaudeComposer
            centered
            threadId={threadId}
            propsRef={propsRef}
            commands={commands}
            pendingMentionsRef={pendingMentionsRef}
            externalProgress={recoveryProgress}
            useExternalProgress={recovering}
            streamedProgress={streamedProgress}
            onStopExternal={() => void stopRecovery()}
            deployChatLocked={deployChatLock.locked}
            deployChatLockMessage={deployChatLock.message}
            deployLiveReloading={Boolean(deployChatLock.liveReloading)}
            queuedSend={queuedSend}
            onQueuedChange={onQueuedChange}
            onFocusInputReady={onFocusInputReady}
          />
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.thread.messages.length > 0}>
        <div className="aui-thread-body">
          <ThreadPrimitive.Viewport
            className="aui-viewport"
            autoScroll={!lightboxOpen}
            scrollToBottomOnRunStart={!lightboxOpen}
          >
            <div className="aui-thread-column">
              <ChatMessages />
              {showInThreadStatus ? (
                <InThreadRunStatus
                  threadId={threadId}
                  externalProgress={recoveryProgress}
                  useExternalProgress={recovering}
                  streamedProgress={streamedProgress}
                />
              ) : null}
              {recovering && recoveryText.trim() ? (
                <InFlightRecoveryMessage text={recoveryText} />
              ) : null}
              <ChatFollowBottom followActive={followActive} recoveryText={lightboxOpen ? '' : recoveryText} />
            </div>
          </ThreadPrimitive.Viewport>
          <div className="aui-compose-footer">
            <div className="aui-thread-column">
              <ClaudeComposer
                threadId={threadId}
                propsRef={propsRef}
                commands={commands}
                pendingMentionsRef={pendingMentionsRef}
                externalProgress={recoveryProgress}
                useExternalProgress={recovering}
                streamedProgress={streamedProgress}
                onStopExternal={() => void stopRecovery()}
                deployChatLocked={deployChatLock.locked}
                deployChatLockMessage={deployChatLock.message}
                deployLiveReloading={Boolean(deployChatLock.liveReloading)}
                queuedSend={queuedSend}
                onQueuedChange={onQueuedChange}
                onFocusInputReady={onFocusInputReady}
              />
              <p className="aui-disclaimer">{readCompanyBrandName()} can make mistakes. Double-check results.</p>
            </div>
          </div>
        </div>
      </AuiIf>
    </ThreadPrimitive.Root>
  );
}

function AgentChatThread({
  threadId,
  propsRef,
  pendingDraft,
  pendingAutoSend,
  importMessagesGeneration = 0,
}: {
  threadId: string;
  propsRef: RefObject<AgentChatPanelProps>;
  pendingDraft?: string | null;
  pendingAutoSend?: boolean;
  importMessagesGeneration?: number;
}) {
  const deployChatLock = useDeployChatLock();
  const [queuedSend, setQueuedSend] = useState(
    () => Boolean(pendingAutoSend) || Boolean(readDeployChatDraftPayload(threadId)?.autoSend),
  );
  const [streamedProgress, setStreamedProgressState] = useState<AgentProgress | null>(null);
  const setStreamedProgress = useCallback((progress: AgentProgress | null) => {
    setStreamedProgressState((prev) => (sameAgentProgressUi(prev, progress) ? prev : progress));
  }, []);
  const pendingMentionsRef = useRef<ChatMention[]>([]);
  const adapter = useMemo(
    () => createChatAdapter(threadId, propsRef, setStreamedProgress, pendingMentionsRef),
    [threadId, propsRef, setStreamedProgress],
  );

  const attachmentAdapter = useMemo(
    () => new CompositeAttachmentAdapter([new ChatImageAttachmentAdapter(), new ChatDocAttachmentAdapter()]),
    [],
  );

  const runtime = useLocalRuntime(adapter, {
    initialMessages: propsRef.current?.initialMessages.map(storedToThreadMessage),
    adapters: { attachments: attachmentAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatLightboxProvider>
        <PersistedMessageImporter generation={importMessagesGeneration} propsRef={propsRef} />
        <PendingDraftBoot
          draft={pendingDraft}
          autoSend={pendingAutoSend}
          threadId={threadId}
          onQueuedChange={setQueuedSend}
        />
        <DeployDraftBoot
          threadId={threadId}
          deployChatLocked={deployChatLock.locked}
          deployChatLockReady={deployChatLock.ready}
          skipRestore={Boolean(pendingDraft)}
          onQueuedChange={setQueuedSend}
        />
        <AgentChatThreadBody
          propsRef={propsRef}
          threadId={threadId}
          streamedProgress={streamedProgress}
          deployChatLock={deployChatLock}
          pendingMentionsRef={pendingMentionsRef}
          queuedSend={queuedSend}
          onQueuedChange={setQueuedSend}
        />
      </ChatLightboxProvider>
    </AssistantRuntimeProvider>
  );
}

export function AgentChatPanel(props: AgentChatPanelProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    armAgentTones();
  }, []);

  const isFocus = props.variant === 'focus';
  const style = {
    '--aui-composer-stack': '6.25rem',
    ...(isFocus ? { '--footer-nav-h': '0px' } : {}),
  } as CSSProperties;

  const chatNav = useMemo(
    () => ({ threadId: props.threadId || null, fromFocus: isFocus }),
    [props.threadId, isFocus],
  );

  return (
    <ChatNavContext.Provider value={chatNav}>
      <div className={isFocus ? 'aui-root aui-root--focus' : 'aui-root'} style={style}>
        <AgentChatThread
          key={props.threadId}
          threadId={props.threadId}
          propsRef={propsRef}
          pendingDraft={props.pendingDraft}
          pendingAutoSend={props.pendingAutoSend}
          importMessagesGeneration={props.importMessagesGeneration}
        />
      </div>
    </ChatNavContext.Provider>
  );
}
