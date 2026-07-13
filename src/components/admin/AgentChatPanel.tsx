import type { CSSProperties, RefObject } from 'react';
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useLocalRuntime,
  useMessage,
  useAuiState,
  type ChatModelAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  filterHelperCommands,
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
      className="aui-msg-actions"
    >
      <ActionBarPrimitive.Copy asChild>
        <button type="button" className="aui-msg-action" aria-label="Copy">
          Copy
        </button>
      </ActionBarPrimitive.Copy>
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

function useSlashHelpers() {
  const composer = useComposerRuntime();
  const [helpersOpen, setHelpersOpen] = useState(false);

  const filtered = filterHelperCommands('');
  const showHelpers = helpersOpen && filtered.length > 0;

  const applyCommand = (command: AgentHelperCommand) => {
    setHelpersOpen(false);
    composer.setText(command.template);
    void composer.send();
  };

  const toggleHelpers = () => {
    setHelpersOpen((open) => !open);
  };

  useEffect(() => {
    if (!helpersOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.aui-helper-panel, .aui-slash-prompt')) return;
      setHelpersOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [helpersOpen]);

  return {
    helpersOpen,
    filtered,
    showHelpers,
    applyCommand,
    toggleHelpers,
  };
}

function SlashPrompt({ placement }: { placement: 'top' | 'tail' }) {
  const helpers = useSlashHelpers();

  return (
    <ComposerPrimitive.Root
      className={`aui-slash-zone aui-slash-zone-${placement}`}
    >
      {helpers.showHelpers ? (
        <HelperCommandsPanel commands={helpers.filtered} onPick={helpers.applyCommand} />
      ) : null}
      <button
        type="button"
        className={`aui-slash-prompt${helpers.helpersOpen ? ' active' : ''}`}
        aria-label="Start a command"
        aria-expanded={helpers.helpersOpen}
        onPointerDown={(e) => e.preventDefault()}
        onClick={helpers.toggleHelpers}
      >
        /
      </button>
    </ComposerPrimitive.Root>
  );
}

function RunningIndicator() {
  return (
    <ComposerPrimitive.Root className="aui-slash-zone aui-slash-zone-tail">
      <ComposerPrimitive.Cancel className="aui-stop" aria-label="Stop generating">
        Stop
      </ComposerPrimitive.Cancel>
    </ComposerPrimitive.Root>
  );
}

function AgentChatThreadBody() {
  const hasMessages = useAuiState((s) => s.thread.messages.length > 0);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-viewport">
        {!hasMessages && !isRunning ? <SlashPrompt placement="top" /> : null}
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="aui-msg-row aui-msg-row-user">
                <div className="aui-msg aui-msg-user">
                  <MessagePrimitive.Parts
                    components={{
                      Text: UserTextPart,
                      Image: UserImagePart,
                    }}
                  />
                </div>
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="aui-msg-row aui-msg-row-assistant">
                <div className="aui-msg aui-msg-assistant">
                  <MessagePrimitive.Parts
                    components={{
                      Text: AssistantMarkdown,
                    }}
                  />
                  <AssistantMessageActions />
                </div>
              </MessagePrimitive.Root>
            ),
          }}
        />
        {hasMessages && !isRunning ? <SlashPrompt placement="tail" /> : null}
        {isRunning ? <RunningIndicator /> : null}
      </ThreadPrimitive.Viewport>
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
      <AgentChatThreadBody />
    </AssistantRuntimeProvider>
  );
}

export function AgentChatPanel(props: AgentChatPanelProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const style = {
    '--aui-compose-pad': '0px',
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
