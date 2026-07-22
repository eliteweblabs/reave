import type { CSSProperties, FocusEvent, KeyboardEvent, RefObject } from 'react';
import {
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  ThreadPrimitive,
  useComposerRuntime,
  useLocalRuntime,
  useAuiState,
  useThreadViewportAutoScroll,
  type ChatModelAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  filterHelperCommands,
  matchHelperCommand,
  type AgentHelperCommand,
} from '../../lib/agentHelperCommands';
import {
  parseStoredChatContent,
  storedChatPlainText,
  userMessageDisplayText,
  type StoredChatImage,
} from '../../lib/chatMessageFormat';
import { getButtonProps, parseAssistantChatButtons } from '../../lib/chatResponseRenderer';
import { readSseStream } from '../../lib/chatAgentSse';
import { useChatRenderer } from '../../hooks/useChatRenderer';
import { ChatButton } from '../ChatButton';
import './agent-chat.css';

type AgentProgressPhase = 'thinking' | 'tool' | 'complete';

type AgentProgress = {
  phase: AgentProgressPhase;
  tool?: string;
  toolLabel?: string;
  round?: number;
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
  const detailText =
    activeProgress?.phase === 'tool' && activeProgress.tool
      ? `Running ${activeProgress.tool.replace(/_/g, ' ')}`
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

export type StoredChatMessage = { role: 'user' | 'assistant'; content: string };

export type AgentChatPanelProps = {
  threadId: string;
  companyName?: string;
  initialMessages: StoredChatMessage[];
  pendingDraft?: string | null;
  pendingAutoSend?: boolean;
  getModel?: () => string | undefined;
  onComposeFocus?: (focused: boolean) => void;
  onComposeDirty?: (dirty: boolean) => void;
  onAgentRunChange?: (running: boolean) => void;
  onAgentProgress?: (progress: AgentProgress | null) => void;
  onRefreshMessages?: () => void | Promise<void>;
  onMessagesPersist?: (userContent: string, assistantContent: string) => void;
  onTitleUpdate?: (title: string) => void;
  onLinkedJobsRefresh?: () => void;
};

type SendResult = {
  ok?: boolean;
  error?: string;
  title?: string;
  userMessage?: StoredChatMessage;
  assistantMessage?: StoredChatMessage;
};

function storedToThreadMessage(message: StoredChatMessage): ThreadMessageLike {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: [{ type: 'text', text: storedChatPlainText(message.content) }],
    };
  }
  const { text, images } = parseStoredChatContent(message.content);
  const displayText = message.role === 'user' ? userMessageDisplayText(text) : text;
  const content: Extract<ThreadMessageLike['content'], readonly unknown[]>[number][] = [];
  if (displayText) content.push({ type: 'text', text: displayText });
  for (const img of images) {
    content.push({
      type: 'image',
      image: `data:${img.mediaType};base64,${img.data}`,
    });
  }
  if (!content.length) content.push({ type: 'text', text: '' });
  return { role: 'user', content };
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

function createChatAdapter(
  threadId: string,
  propsRef: RefObject<AgentChatPanelProps>,
  onStreamedProgress: (progress: AgentProgress | null) => void,
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
      const model = propsRef.current?.getModel?.();
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
            stream: true,
            ...(model ? { model } : {}),
          }),
          signal: options.abortSignal,
        });

        const contentType = res.headers.get('Content-Type') ?? '';
        if (contentType.includes('text/event-stream') && res.body) {
          let streamedText = '';
          for await (const { event, data } of readSseStream(res.body, options.abortSignal)) {
            if (event === 'progress') {
              emitProgress({
                phase: data.phase === 'tool' ? 'tool' : 'thinking',
                tool: typeof data.tool === 'string' ? data.tool : undefined,
                toolLabel: typeof data.toolLabel === 'string' ? data.toolLabel : undefined,
                round: typeof data.round === 'number' ? data.round : undefined,
              });
            } else if (event === 'text' && typeof data.text === 'string') {
              streamedText = data.text;
              yield { content: [{ type: 'text', text: streamedText }] };
            } else if (event === 'done') {
              if (data.ok === false) {
                throw new Error(typeof data.error === 'string' ? data.error : 'Agent failed');
              }
              if (typeof data.title === 'string') propsRef.current?.onTitleUpdate?.(data.title);
              propsRef.current?.onLinkedJobsRefresh?.();
              const userMsg = data.userMessage as { content?: string } | undefined;
              const assistantMsg = data.assistantMessage as { content?: string } | undefined;
              if (userMsg?.content && assistantMsg?.content) {
                propsRef.current?.onMessagesPersist?.(userMsg.content, assistantMsg.content);
              }
              const assistantText = storedChatPlainText(assistantMsg?.content ?? streamedText);
              yield { content: [{ type: 'text', text: assistantText }] };
              return;
            } else if (event === 'error') {
              throw new Error(typeof data.error === 'string' ? data.error : 'Agent failed');
            }
          }
          if (streamedText) {
            yield { content: [{ type: 'text', text: streamedText }] };
          }
          return;
        }

        let data: SendResult = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}`);
        }
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        if (data.title) propsRef.current?.onTitleUpdate?.(data.title);
        propsRef.current?.onLinkedJobsRefresh?.();
        if (data.userMessage?.content && data.assistantMessage?.content) {
          propsRef.current?.onMessagesPersist?.(
            data.userMessage.content,
            data.assistantMessage.content,
          );
        }

        const assistantText = storedChatPlainText(data.assistantMessage?.content ?? '');
        yield { content: [{ type: 'text', text: assistantText }] };
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
}: {
  draft?: string | null;
  autoSend?: boolean;
}) {
  const composer = useComposerRuntime();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !draft) return;
    ran.current = true;
    composer.setText(draft);
    if (autoSend) void composer.send();
  }, [autoSend, composer, draft]);
  return null;
}

function AssistantTextPart(props: { text?: string }) {
  const { text, buttons } = useChatRenderer(props.text ?? '');

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

function UserImagePart(props: { image?: string; alt?: string }) {
  if (!props.image) return null;
  return (
    <img
      className="aui-msg-img"
      src={props.image}
      alt={props.alt || 'Attached image'}
      loading="lazy"
    />
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

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.5 10.8 5l5.4 5.4H3v1.2h13.2L10.8 17l1.2 1.5L21 12 12 3.5Z"
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 6.5v9.25a4.25 4.25 0 1 1-8.5 0V7.75a2.75 2.75 0 1 1 5.5 0v8.5a1.25 1.25 0 1 1-2.5 0V8h-1.5v8.25a2.75 2.75 0 1 0 5.5 0V7.75a4.25 4.25 0 1 0-8.5 0v8.25a5.75 5.75 0 1 0 11.5 0V6.5h-1.5Z"
      />
    </svg>
  );
}

function ComposerAttachmentPreview() {
  return (
    <div className="aui-composer-attachment">
      <AttachmentPrimitive.unstable_Thumb className="aui-composer-attachment-thumb" />
      <AttachmentPrimitive.Remove
        className="aui-composer-attachment-remove"
        aria-label="Remove attachment"
      >
        ×
      </AttachmentPrimitive.Remove>
    </div>
  );
}

function ClaudeComposer({
  propsRef,
  commands,
  onFocusInputReady,
  centered = false,
  threadId,
  externalProgress,
  useExternalProgress,
  streamedProgress,
  onStopExternal,
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  commands: AgentHelperCommand[];
  onFocusInputReady?: (focus: () => void) => void;
  centered?: boolean;
  threadId: string;
  externalProgress?: AgentProgress | null;
  useExternalProgress?: boolean;
  streamedProgress?: AgentProgress | null;
  onStopExternal?: () => void;
}) {
  const helpers = useSlashHelpers(propsRef, commands);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const showRunning = isRunning || useExternalProgress;

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
              <ComposerPrimitive.Cancel className="aui-composer-stop" aria-label="Stop generating">
                Stop
              </ComposerPrimitive.Cancel>
            )}
          </div>
        </ComposerPrimitive.Root>
      </div>
    );
  }

  return (
    <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
      {helpers.showHelpers ? (
        <HelperCommandsPanel
          commands={helpers.filtered}
          onPick={helpers.applyCommand}
          activeIdx={helpers.activeIdx}
        />
      ) : null}
      <ComposerPrimitive.Root className="aui-composer-card">
        <AuiIf condition={(s) => s.composer.attachments.length > 0}>
          <div className="aui-composer-attachments">
            <ComposerPrimitive.Attachments components={{ Image: ComposerAttachmentPreview }} />
          </div>
        </AuiIf>
        <ComposerPrimitive.Input
          ref={helpers.inputRef}
          className="aui-input"
          placeholder="How can I help you today?"
          rows={1}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          addAttachmentOnPaste
          onFocus={helpers.onFocus}
          onBlur={helpers.onBlur}
          onInput={(e) => helpers.onInput(e.currentTarget.value)}
          onKeyDown={helpers.onKeyDown}
        />
        <div className="aui-composer-toolbar">
          <ComposerPrimitive.AddAttachment
            className="aui-composer-attach"
            aria-label="Attach image"
            multiple
          >
            <AttachIcon />
          </ComposerPrimitive.AddAttachment>
          <span className="aui-composer-hint">Type / for commands · paste images</span>
          <ComposerPrimitive.Send
            className="aui-composer-send"
            aria-label="Send message"
            onPointerDown={(e) => e.preventDefault()}
          >
            <SendIcon />
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
}

function ChatMessages() {
  return (
    <>
      <ThreadPrimitive.Messages
        components={{
          UserMessage: () => (
            <MessagePrimitive.Root className="aui-msg-row aui-msg-row-user group/message">
              <div className="aui-msg-wrap aui-msg-wrap-user">
                <div className="aui-msg aui-msg-user">
                  <MessagePrimitive.Parts
                    components={{
                      Text: UserTextPart,
                      Image: UserImagePart,
                    }}
                  />
                </div>
                {/* Per-message Copy/Share action bar intentionally omitted: its autohide-on-hover
                    behavior caused layout jumpiness on non-mobile devices. */}
              </div>
            </MessagePrimitive.Root>
          ),
          AssistantMessage: () => (
            <MessagePrimitive.Root className="aui-msg-row aui-msg-row-assistant group/message">
              <div className="aui-msg-wrap aui-msg-wrap-assistant">
                <div className="aui-msg aui-msg-assistant">
                  <MessagePrimitive.Parts
                    components={{
                      Text: AssistantTextPart,
                    }}
                  />
                </div>
                {/* Per-message Copy/Share action bar intentionally omitted: its autohide-on-hover
                    behavior caused layout jumpiness on non-mobile devices. */}
              </div>
            </MessagePrimitive.Root>
          ),
        }}
      />
    </>
  );
}

function useRecoverInFlightRun(threadId: string, propsRef: RefObject<AgentChatPanelProps>) {
  const [recovering, setRecovering] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<AgentProgress | null>(null);
  const [recoveryText, setRecoveryText] = useState('');
  const recoveringRef = useRef(false);

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
  }, [propsRef, threadId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}/progress`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { running?: boolean; progress?: AgentProgress | null };
        const active = Boolean(data.running || data.progress);
        if (!active) {
          if (recoveringRef.current) {
            recoveringRef.current = false;
            setRecovering(false);
            setRecoveryProgress(null);
            setRecoveryText('');
            propsRef.current?.onAgentRunChange?.(false);
            await propsRef.current?.onRefreshMessages?.();
          }
          if (timer) {
            window.clearInterval(timer);
            timer = null;
          }
          return;
        }
        recoveringRef.current = true;
        setRecovering(true);
        propsRef.current?.onAgentRunChange?.(true);
        if (data.progress) {
          setRecoveryProgress(data.progress);
          if (data.progress.partialText) setRecoveryText(data.progress.partialText);
        }
        if (!timer) timer = window.setInterval(() => void poll(), 900);
      } catch {
        /* ignore */
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [propsRef, threadId]);

  return { recovering, recoveryProgress, recoveryText, stopRecovery };
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
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  threadId: string;
  streamedProgress: AgentProgress | null;
}) {
  const [commands, setCommands] = useState<AgentHelperCommand[]>([]);
  const focusComposerRef = useRef<(() => void) | null>(null);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const { recovering, recoveryProgress, recoveryText, stopRecovery } = useRecoverInFlightRun(
    threadId,
    propsRef,
  );
  const showThreadStatus = isRunning || recovering;

  useThreadViewportAutoScroll({ autoScroll: true });

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
            externalProgress={recoveryProgress}
            useExternalProgress={recovering}
            streamedProgress={streamedProgress}
            onStopExternal={() => void stopRecovery()}
            onFocusInputReady={(focus) => {
              focusComposerRef.current = focus;
            }}
          />
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.thread.messages.length > 0}>
        <div className="aui-thread-body">
          <ThreadPrimitive.Viewport className="aui-viewport">
            <div className="aui-thread-column">
              <ChatMessages />
              {showThreadStatus && !recoveryText.trim() ? (
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
            </div>
          </ThreadPrimitive.Viewport>
          <div className="aui-compose-footer">
            <div className="aui-thread-column">
              <ClaudeComposer
                threadId={threadId}
                propsRef={propsRef}
                commands={commands}
                externalProgress={recoveryProgress}
                useExternalProgress={recovering}
                streamedProgress={streamedProgress}
                onStopExternal={() => void stopRecovery()}
                onFocusInputReady={(focus) => {
                  focusComposerRef.current = focus;
                }}
              />
              <p className="aui-disclaimer">{readCompanyBrandName()} can make mistakes. Double-check important info.</p>
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
  const [streamedProgress, setStreamedProgress] = useState<AgentProgress | null>(null);
  const adapter = useMemo(
    () => createChatAdapter(threadId, propsRef, setStreamedProgress),
    [threadId, propsRef],
  );

  const imageAttachmentAdapter = useMemo(() => new SimpleImageAttachmentAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: propsRef.current?.initialMessages.map(storedToThreadMessage),
    adapters: { attachments: imageAttachmentAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PendingDraftBoot draft={pendingDraft} autoSend={pendingAutoSend} />
      <AgentChatThreadBody
        propsRef={propsRef}
        threadId={threadId}
        streamedProgress={streamedProgress}
      />
    </AssistantRuntimeProvider>
  );
}

export function AgentChatPanel(props: AgentChatPanelProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const style = {
    '--aui-composer-stack': '6.25rem',
  } as CSSProperties;

  return (
    <div className="aui-root" style={style}>
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
