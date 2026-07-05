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
  useAui,
  useAuiState,
  type ChatModelAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
  SimpleImageAttachmentAdapter,
  CompositeAttachmentAdapter,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useMemo, useRef } from 'react';
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

/** Send on first tap — touch blur was collapsing compose before click fired. */
function ComposerSendButton() {
  const aui = useAui();
  const disabled = useAuiState(
    (s) =>
      !s.composer.canSend ||
      (s.thread.isRunning && !s.thread.capabilities.queue),
  );

  const activateSend = () => {
    const composer = aui.composer();
    let state = composer.getState();
    if (!state.canSend) {
      const ta = document.querySelector('#chat-panel .aui-input');
      if (ta instanceof HTMLTextAreaElement && ta.value.trim()) {
        composer.setText(ta.value);
        state = composer.getState();
      }
    }
    if (
      !state.canSend ||
      (aui.thread().getState().isRunning && !aui.thread().getState().capabilities.queue)
    ) {
      return;
    }
    composer.send();
  };

  return (
    <button
      type="button"
      className="aui-send"
      aria-label="Send message"
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || e.pointerType !== 'touch') return;
        e.preventDefault();
        activateSend();
      }}
      onClick={(e) => {
        if (e.pointerType === 'touch') return;
        activateSend();
      }}
    >
      ↑
    </button>
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
  const attachments = useMemo(
    () => new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter()]),
    [],
  );

  const runtime = useLocalRuntime(adapter, {
    initialMessages: propsRef.current?.initialMessages.map(storedToThreadMessage),
    adapters: { attachments },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PendingDraftBoot draft={pendingDraft} autoSend={pendingAutoSend} />
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-viewport">
          <ThreadPrimitive.Empty className="aui-empty">Send a message to start.</ThreadPrimitive.Empty>
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
        </ThreadPrimitive.Viewport>
        <div className="aui-compose-footer">
          <ComposerPrimitive.Root className="aui-compose">
            <ComposerPrimitive.Attachments />
            <div className="aui-compose-row">
              <ComposerPrimitive.Input
                className="aui-input"
                placeholder="Message the agent…"
                rows={1}
                autoFocus={!pendingAutoSend}
                enterKeyHint="send"
                onFocus={() => propsRef.current?.onComposeFocus?.(true)}
                onBlur={() => propsRef.current?.onComposeFocus?.(false)}
              />
              <ComposerSendButton />
              <ComposerPrimitive.Cancel className="aui-stop" aria-label="Stop generating">
                Stop
              </ComposerPrimitive.Cancel>
            </div>
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Root>
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
