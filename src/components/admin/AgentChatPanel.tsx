import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useLocalRuntime,
  useMessage,
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
  type StoredChatImage,
} from '../../lib/chatMessageFormat';
import './agent-chat.css';

export type StoredChatMessage = { role: 'user' | 'assistant'; content: string };

export type AgentChatPanelProps = {
  threadId: string;
  initialMessages: StoredChatMessage[];
  pendingDraft?: string | null;
  pendingAutoSend?: boolean;
  getModel?: () => string | undefined;
  onComposeFocus?: (focused: boolean) => void;
  onComposeDirty?: (dirty: boolean) => void;
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
  const content: ThreadMessageLike['content'] = [];
  if (text) content.push({ type: 'text', text });
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
): ChatModelAdapter {
  return {
    async run(options) {
      const lastUser = [...options.messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) throw new Error('No user message');

      const text = (lastUser.content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
        .trim();

      const images = extractImagesFromUserMessage(lastUser);
      const model = propsRef.current?.getModel?.();

      const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          images,
          ...(model ? { model } : {}),
        }),
        signal: options.abortSignal,
      });

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
      return {
        content: [{ type: 'text', text: assistantText }],
      };
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

function AssistantMarkdown() {
  return <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="aui-md" />;
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

function MessageCopyButton({ label }: { label: string }) {
  return (
    <ActionBarPrimitive.Copy asChild>
      <button type="button" className="aui-msg-action" aria-label={label}>
        Copy
      </button>
    </ActionBarPrimitive.Copy>
  );
}

function UserMessageActions() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-msg-actions aui-msg-actions-user"
    >
      <MessageCopyButton label="Copy message" />
    </ActionBarPrimitive.Root>
  );
}

function AssistantMessageActions() {
  const message = useMessage();
  const plain = (message.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');

  const share = async () => {
    const payload = { text: plain, title: 'Assistant — Reave chat' };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      /* ignore */
    }
  };

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="aui-msg-actions aui-msg-actions-assistant"
    >
      <MessageCopyButton label="Copy response" />
      <button type="button" className="aui-msg-action" aria-label="Share" onClick={() => void share()}>
        Share
      </button>
    </ActionBarPrimitive.Root>
  );
}

function HelperCommandsPanel({
  commands,
  onPick,
}: {
  commands: AgentHelperCommand[];
  onPick: (command: AgentHelperCommand) => void;
}) {
  return (
    <div className="aui-helper-panel" onPointerDown={(e) => e.preventDefault()}>
      <ul className="aui-helper-list" role="listbox" aria-label="Helper commands">
        {commands.map((command) => (
          <li key={command.slash}>
            <button
              type="button"
              className="aui-helper-item"
              role="option"
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

function useSlashHelpers(
  propsRef: RefObject<AgentChatPanelProps>,
  commands: AgentHelperCommand[],
) {
  const composer = useComposerRuntime();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [composeText, setComposeText] = useState('');
  const [helpersOpen, setHelpersOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const filtered = filterHelperCommands(composeText, commands);
  const showHelpers = helpersOpen && filtered.length > 0;

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

  const scheduleCloseHelpers = () => {
    clearBlurTimer();
    blurTimer.current = setTimeout(() => setHelpersOpen(false), 120);
  };

  const focusInput = useCallback(() => {
    const el = inputRef.current ?? document.querySelector('#chat-panel .aui-input');
    if (el instanceof HTMLTextAreaElement) el.focus();
  }, []);

  const applyCommand = (command: AgentHelperCommand) => {
    composer.setText(command.template);
    setComposeText(command.template);
    openHelpers();
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
    if (!composeText.trim() || composeText.startsWith('/')) openHelpers();
    propsRef.current?.onComposeFocus?.(true);
  };

  const onBlur = () => {
    scheduleCloseHelpers();
    propsRef.current?.onComposeFocus?.(false);
  };

  const onInput = (value: string) => {
    setComposeText(value);
    propsRef.current?.onComposeDirty?.(value.trim().length > 0);
    if (!value.trim() || value.startsWith('/')) {
      openHelpers();
      return;
    }
    setHelpersOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (composer.getState().canSend) void composer.send();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey) return;
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

function ClaudeComposer({
  propsRef,
  commands,
  onFocusInputReady,
  centered = false,
}: {
  propsRef: RefObject<AgentChatPanelProps>;
  commands: AgentHelperCommand[];
  onFocusInputReady?: (focus: () => void) => void;
  centered?: boolean;
}) {
  const helpers = useSlashHelpers(propsRef, commands);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  useEffect(() => {
    onFocusInputReady?.(helpers.focusInput);
  }, [helpers.focusInput, onFocusInputReady]);

  if (isRunning) {
    return (
      <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
        <ComposerPrimitive.Root className="aui-composer-card aui-composer-card-running">
          <div className="aui-composer-toolbar">
            <span className="aui-composer-status">Thinking…</span>
            <ComposerPrimitive.Cancel className="aui-composer-stop" aria-label="Stop generating">
              Stop
            </ComposerPrimitive.Cancel>
          </div>
        </ComposerPrimitive.Root>
      </div>
    );
  }

  return (
    <div className={`aui-composer-shell${centered ? ' aui-composer-shell-centered' : ''}`}>
      {helpers.showHelpers ? (
        <HelperCommandsPanel commands={helpers.filtered} onPick={helpers.applyCommand} />
      ) : null}
      <ComposerPrimitive.Root className="aui-composer-card">
        <ComposerPrimitive.Input
          ref={helpers.inputRef}
          className="aui-input"
          placeholder="How can I help you today?"
          rows={1}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onFocus={helpers.onFocus}
          onBlur={helpers.onBlur}
          onInput={(e) => helpers.onInput(e.currentTarget.value)}
          onKeyDown={helpers.onKeyDown}
        />
        <div className="aui-composer-toolbar">
          <span className="aui-composer-hint">Type / for commands</span>
          <ComposerPrimitive.Send className="aui-composer-send" aria-label="Send message">
            <SendIcon />
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
}

function ChatMessages() {
  return (
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
              <UserMessageActions />
            </div>
          </MessagePrimitive.Root>
        ),
        AssistantMessage: () => (
          <MessagePrimitive.Root className="aui-msg-row aui-msg-row-assistant group/message">
            <div className="aui-msg-wrap aui-msg-wrap-assistant">
              <div className="aui-msg aui-msg-assistant">
                <MessagePrimitive.Parts
                  components={{
                    Text: AssistantMarkdown,
                  }}
                />
              </div>
              <AssistantMessageActions />
            </div>
          </MessagePrimitive.Root>
        ),
      }}
    />
  );
}

function AgentChatThreadBody({
  propsRef,
}: {
  propsRef: RefObject<AgentChatPanelProps>;
}) {
  const [commands, setCommands] = useState<AgentHelperCommand[]>([]);
  const focusComposerRef = useRef<(() => void) | null>(null);

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
            propsRef={propsRef}
            commands={commands}
            onFocusInputReady={(focus) => {
              focusComposerRef.current = focus;
            }}
          />
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.thread.messages.length > 0}>
        <ThreadPrimitive.Viewport className="aui-viewport">
          <div className="aui-thread-column">
            <ChatMessages />
          </div>
          <ThreadPrimitive.ViewportFooter className="aui-viewport-footer">
            <div className="aui-thread-column">
              <ClaudeComposer
                propsRef={propsRef}
                commands={commands}
                onFocusInputReady={(focus) => {
                  focusComposerRef.current = focus;
                }}
              />
              <p className="aui-disclaimer">Reave can make mistakes. Double-check important info.</p>
            </div>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
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
  const adapter = useMemo(() => createChatAdapter(threadId, propsRef), [threadId, propsRef]);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: propsRef.current?.initialMessages.map(storedToThreadMessage),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PendingDraftBoot draft={pendingDraft} autoSend={pendingAutoSend} />
      <AgentChatThreadBody propsRef={propsRef} />
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
