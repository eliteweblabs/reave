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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  filterHelperCommands,
  matchHelperCommand,
  type AgentHelperCommand,
} from '../../lib/agentHelperCommands';
import {
  mentionsPresentInText,
  type ChatMention,
  type PeopleSearchResult,
} from '../../lib/chatMentions';
import {
  parseStoredChatContent,
  storedChatPlainText,
  userMessageDisplayText,
  type StoredChatDoc,
  type StoredChatImage,
} from '../../lib/chatMessageFormat';
import { getButtonProps, parseAssistantChatButtons } from '../../lib/chatResponseRenderer';
import { isSseStalledError, readSseStream } from '../../lib/chatAgentSse';
import { formatAgentUsageLine, type AgentUsageSummary } from '../../lib/agentUsage';
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
const DEPLOY_INDICATOR_POLL_MS = 60_000;
const PPTX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const CHAT_DOC_ACCEPT = `application/pdf,${PPTX_MEDIA_TYPE},.pdf,.pptx`;

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

type AgentProgressPhase = 'thinking' | 'tool' | 'complete';

type AgentProgress = {
  phase: AgentProgressPhase;
  tool?: string;
  toolLabel?: string;
  round?: number;
  concurrent?: number;
  startedAt: number;
  updatedAt: number;
  partialText?: string;
};

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
        if (!cancelled && !streamedProgress) setPolledProgress(data.progress ?? null);
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
  const text = textParts.join('');
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
  /** `focus` — minimal full-screen skin at `/focus` (no footer nav padding). */
  variant?: 'default' | 'focus';
  getModel?: () => string | undefined;
  onComposeFocus?: (focused: boolean) => void;
  onComposeDirty?: (dirty: boolean) => void;
  onAgentRunChange?: (running: boolean) => void;
  onAgentProgress?: (progress: AgentProgress | null) => void;
  onRefreshMessages?: () => void | Promise<void>;
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
      metadata: message.agent_usage ? { agentUsage: message.agent_usage } : undefined,
      content: [{ type: 'text', text: storedChatPlainText(message.content) }],
    };
  }
  const { text, images, docs } = parseStoredChatContent(message.content);
  const displayText = message.role === 'user' ? userMessageDisplayText(text) : text;
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

      const text = (lastUser.content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
        .trim();

      const images = extractImagesFromUserMessage(lastUser);
      const docs = extractDocsFromUserMessage(lastUser);
      const model = propsRef.current?.getModel?.();
      const mentions = mentionsPresentInText(pendingMentionsRef.current ?? [], text);
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

          try {
            for await (const { event, data } of readSseStream(res.body, options.abortSignal, {
              idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
            })) {
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
            if (!isSseStalledError(err) && !(err instanceof TypeError)) throw err;
            // Stalled or network-level failure: the server is still working.
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
      }
    },
  };
}

function PendingDraftBoot({
  draft,
  autoSend,
  deployChatLocked,
}: {
  draft?: string | null;
  autoSend?: boolean;
  deployChatLocked?: boolean;
}) {
  const composer = useComposerRuntime();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !draft) return;
    ran.current = true;
    composer.setText(draft);
    if (autoSend && !deployChatLocked) void composer.send();
  }, [autoSend, composer, deployChatLocked, draft]);
  return null;
}

type DeployChatLockState = { locked: boolean; message: string | null };

function useDeployChatLock(): DeployChatLockState {
  const [state, setState] = useState<DeployChatLockState>({ locked: false, message: null });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/deploy/indicator', { cache: 'no-store' });
      const data = (await res.json()) as {
        ok?: boolean;
        deploy?: { chatLocked?: boolean; chatLockMessage?: string | null } | null;
      };
      if (!res.ok || !data.ok || !data.deploy) {
        setState({ locked: false, message: null });
        return;
      }
      setState({
        locked: Boolean(data.deploy.chatLocked),
        message: data.deploy.chatLockMessage ?? null,
      });
    } catch {
      setState({ locked: false, message: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), DEPLOY_INDICATOR_POLL_MS);
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  return state;
}

function AssistantTextPart(props: { text?: string; status?: { type?: string } }) {
  const isStreaming = props.status?.type === 'running';
  const { text, buttons } = useChatRenderer(props.text ?? '', { skipStructured: isStreaming });

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
        />
      ) : null}
      {buttons.length > 0 ? (
        <div className="aui-chat-buttons">
          {buttons.map((button, idx) => (
            <ChatButton key={`${button.href}-${idx}`} {...getButtonProps(button)} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function UserTextPart(props: { text?: string }) {
  return <span className="aui-text">{props.text}</span>;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
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
  const [open, setOpen] = useState(false);
  const label = alt || 'Attached image';

  return (
    <>
      <button
        type="button"
        className={`aui-chat-img-btn${thumb ? ' aui-chat-img-btn--thumb' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`View full size: ${label}`}
      >
        <img className={className} src={src} alt={label} loading="lazy" />
      </button>
      {open ? <ChatImageLightbox src={src} alt={label} onClose={() => setOpen(false)} /> : null}
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
      name: person.name,
      email: person.email,
      company: person.company,
    };
  }
  return {
    kind: 'user',
    userId: person.userId,
    name: person.name,
    email: person.email,
  };
}

function peopleSubline(person: PeopleSearchResult): string {
  if (person.kind === 'contact') {
    return [person.company, person.email, person.phone].filter(Boolean).join(' · ') || 'Client';
  }
  return [person.email, person.username].filter(Boolean).join(' · ') || 'Team';
}

/** Active `@query` token ending at caret (token-scoped, not whole-string). */
function activeMentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = before.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  return { start, query: match[1] ?? '' };
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
          const sub = peopleSubline(person);
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
                <span className="aui-mention-kind">{person.kind === 'contact' ? 'Client' : 'Team'}</span>
                <span className="aui-mention-body">
                  <span className="aui-helper-item-slash">@{person.name}</span>
                  {sub ? <span className="aui-helper-item-summary">{sub}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useMentions(pendingMentionsRef: RefObject<ChatMention[]>) {
  const composer = useComposerRuntime();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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
    const el = inputRef.current ?? document.querySelector('#chat-panel .aui-input');
    if (el instanceof HTMLTextAreaElement) el.focus();
  }, []);

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
    const el = inputRef.current;
    const value = el?.value ?? '';
    const caret = el?.selectionStart ?? value.length;
    const active = activeMentionAt(value, caret) ?? (tokenStart >= 0 ? { start: tokenStart, query } : null);
    if (!active) return;

    const mention = peopleResultToMention(person);
    const before = value.slice(0, active.start);
    const after = value.slice(caret);
    const insert = `@${mention.name} `;
    const next = `${before}${insert}${after}`;
    const nextCaret = before.length + insert.length;

    const prev = pendingMentionsRef.current ?? [];
    const key =
      mention.kind === 'contact' ? `contact:${mention.uid}` : `user:${mention.userId}`;
    const withoutDup = prev.filter((m) =>
      m.kind === 'contact' ? `contact:${m.uid}` !== key : `user:${m.userId}` !== key,
    );
    pendingMentionsRef.current = [...withoutDup, mention];

    composer.setText(next);
    closeMentions();
    focusInput();
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const onInput = (value: string, caret: number) => {
    // Slash helpers own the whole string when it starts with `/`.
    if (value.startsWith('/')) {
      closeMentions();
      return;
    }
    const active = activeMentionAt(value, caret);
    if (!active) {
      closeMentions();
      return;
    }
    clearBlurTimer();
    setTokenStart(active.start);
    setQuery(active.query);
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
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

  const onBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
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
    inputRef,
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
) {
  const composer = useComposerRuntime();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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
    const el = inputRef.current ?? document.querySelector('#chat-panel .aui-input');
    if (el instanceof HTMLTextAreaElement) el.focus();
  }, []);

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

  const onBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (composer.getState().canSend) void composer.send();
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
      void composer.send();
      return;
    }
    if (composer.getState().canSend) void composer.send();
  };

  return {
    inputRef,
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
}) {
  const helpers = useSlashHelpers(propsRef, commands);
  const mentions = useMentions(pendingMentionsRef);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const showRunning = isRunning || useExternalProgress;
  useCapComposerAttachments();

  const setInputRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      helpers.inputRef.current = el;
      mentions.inputRef.current = el;
    },
    [helpers.inputRef, mentions.inputRef],
  );

  useEffect(() => {
    onFocusInputReady?.(helpers.focusInput);
  }, [helpers.focusInput, onFocusInputReady]);

  if (showRunning) {
    return (
      <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
        <ComposerPrimitive.Root className="aui-composer-card aui-composer-card-running">
          <div className="aui-composer-toolbar aui-composer-toolbar-running">
            {/* The in-thread run status renders the live progress inside the message
                flow, so only the centered empty-state composer (which has no thread
                status above it) repeats the copy here. Otherwise show just Stop. */}
            {centered ? (
              <AgentRunStatus
                threadId={threadId}
                externalProgress={externalProgress ?? null}
                useExternalProgress={Boolean(useExternalProgress)}
                streamedProgress={streamedProgress ?? null}
              />
            ) : null}
            {useExternalProgress ? (
              <button
                type="button"
                className="aui-composer-stop"
                aria-label="Stop generating"
                onClick={() => onStopExternal?.()}
              >
                Stop
              </button>
            ) : (
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
            )}
          </div>
        </ComposerPrimitive.Root>
      </div>
    );
  }

  if (deployChatLocked) {
    return (
      <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
        <div className="aui-composer-deploy-lock" role="status">
          <span className="aui-composer-deploy-lock-icon" aria-hidden="true">
            🚀
          </span>
          <p className="aui-composer-deploy-lock-text">
            {deployChatLockMessage ||
              'Deploy in progress — new messages are paused until the new version is live.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
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
          <ComposerPrimitive.Input
            ref={setInputRef}
            className="aui-input"
            placeholder="How can I help you today?"
            rows={1}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            addAttachmentOnPaste
            onFocus={() => {
              helpers.onFocus();
              mentions.onFocus();
            }}
            onBlur={(e) => {
              helpers.onBlur(e);
              mentions.onBlur(e);
            }}
            onInput={(e) => {
              const value = e.currentTarget.value;
              const caret = e.currentTarget.selectionStart ?? value.length;
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
              Type @ to mention · / for commands · paste or drag images, SVGs, PDFs, or PowerPoint
              files
            </span>
            <ComposerPrimitive.Send
              className="aui-composer-send"
              aria-label="Send message"
              // iOS Safari fires `blur` on the composer textarea before `click` on
              // whatever was tapped. Without this, the first tap on Send just closes
              // the keyboard (and can shift the layout enough to eat the tap), so a
              // second tap is needed to actually send. Preventing the default action
              // of mousedown/pointerdown stops the browser from moving focus off the
              // textarea, so the keyboard stays open and the tap sends immediately.
              // Both handlers are needed: iOS's pointer-event support has been
              // inconsistent about suppressing the compatibility mousedown it's
              // supposed to when pointerdown is cancelled.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <SendIcon />
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.AttachmentDropzone>
    </div>
  );
}

function ChatMessages() {
  return (
    <>
      <ThreadPrimitive.Messages
        components={{
          UserMessage: () => (
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
          ),
          AssistantMessage: () => (
            <ChatMessageShell align="assistant" bubbleClassName="aui-msg aui-msg-assistant">
              <MessagePrimitive.Parts
                components={{
                  Text: AssistantTextPart,
                }}
              />
            </ChatMessageShell>
          ),
        }}
      />
    </>
  );
}

/** Poll cadence while following a server-side run vs. while idle. */
const RECOVERY_ACTIVE_POLL_MS = 900;
const RECOVERY_IDLE_POLL_MS = 5_000;

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
) {
  const [recovering, setRecovering] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<AgentProgress | null>(null);
  const [recoveryText, setRecoveryText] = useState('');
  const recoveringRef = useRef(false);
  const localRunningRef = useRef(localRunning);
  localRunningRef.current = localRunning;

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
      await propsRef.current?.onRefreshMessages?.();
    };

    const poll = async () => {
      // While this tab is streaming the run itself, the adapter owns the UI (and
      // has its own recovery); a second spinner here would just duplicate it.
      if (localRunningRef.current) {
        schedule(RECOVERY_IDLE_POLL_MS);
        return;
      }

      const status = await fetchRunProgress(threadId);
      if (cancelled) return;

      const active = Boolean(status && (status.running || status.progress));
      if (active && status) {
        checkedForOrphanedTurn = true;
        recoveringRef.current = true;
        setRecovering(true);
        propsRef.current?.onAgentRunChange?.(true);
        if (status.progress) {
          setRecoveryProgress(status.progress);
          if (status.progress.partialText) setRecoveryText(status.progress.partialText);
        }
        schedule(RECOVERY_ACTIVE_POLL_MS);
        return;
      }

      if (recoveringRef.current) {
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
    return (message.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
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
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  threadId: string;
  streamedProgress: AgentProgress | null;
  deployChatLock: DeployChatLockState;
  pendingMentionsRef: RefObject<ChatMention[]>;
}) {
  const [commands, setCommands] = useState<AgentHelperCommand[]>([]);
  const focusComposerRef = useRef<(() => void) | null>(null);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { recovering, recoveryProgress, recoveryText, stopRecovery } = useRecoverInFlightRun(
    threadId,
    propsRef,
    isRunning,
  );
  const showThreadStatus = isRunning || recovering;
  const inFlightAssistantText = useAuiState((s) =>
    s.thread.isRunning ? lastAssistantMessageText(s.thread.messages) : '',
  );
  const showInThreadStatus = showThreadStatus && !recoveryText.trim() && !inFlightAssistantText.trim();

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
          <h1 className="aui-empty-heading">How can I help you today?</h1>
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
            onFocusInputReady={(focus) => {
              focusComposerRef.current = focus;
            }}
          />
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.thread.messages.length > 0}>
        <div className="aui-thread-body">
          <ThreadPrimitive.Viewport
            className="aui-viewport"
            autoScroll
            scrollToBottomOnRunStart
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
              <ChatFollowBottom followActive={showThreadStatus} recoveryText={recoveryText} />
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
                onFocusInputReady={(focus) => {
                  focusComposerRef.current = focus;
                }}
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
}: {
  threadId: string;
  propsRef: RefObject<AgentChatPanelProps>;
  pendingDraft?: string | null;
  pendingAutoSend?: boolean;
}) {
  const deployChatLock = useDeployChatLock();
  const [streamedProgress, setStreamedProgress] = useState<AgentProgress | null>(null);
  const pendingMentionsRef = useRef<ChatMention[]>([]);
  const adapter = useMemo(
    () => createChatAdapter(threadId, propsRef, setStreamedProgress, pendingMentionsRef),
    [threadId, propsRef],
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
      <PendingDraftBoot
        draft={pendingDraft}
        autoSend={pendingAutoSend}
        deployChatLocked={deployChatLock.locked}
      />
      <AgentChatThreadBody
        propsRef={propsRef}
        threadId={threadId}
        streamedProgress={streamedProgress}
        deployChatLock={deployChatLock}
        pendingMentionsRef={pendingMentionsRef}
      />
    </AssistantRuntimeProvider>
  );
}

export function AgentChatPanel(props: AgentChatPanelProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const isFocus = props.variant === 'focus';
  const style = {
    '--aui-composer-stack': '6.25rem',
    ...(isFocus ? { '--footer-nav-h': '0px' } : {}),
  } as CSSProperties;

  return (
    <div className={isFocus ? 'aui-root aui-root--focus' : 'aui-root'} style={style}>
      <AgentChatThread
        key={props.threadId}
        threadId={props.threadId}
        propsRef={propsRef}
        pendingDraft={props.pendingDraft}
        pendingAutoSend={props.pendingAutoSend}
      />
    </div>
  );
}
