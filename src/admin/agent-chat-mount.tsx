import '@vitejs/plugin-react/preamble';
import { createRoot, type Root } from 'react-dom/client';
import { AgentChatPanel, type AgentChatPanelProps } from '../components/admin/AgentChatPanel';

type MountRecord = {
  root: Root;
  props: AgentChatPanelProps;
};

const mounts = new WeakMap<HTMLElement, MountRecord>();

function renderMount(el: HTMLElement, props: AgentChatPanelProps) {
  let record = mounts.get(el);
  if (!record) {
    const root = createRoot(el);
    record = { root, props };
    mounts.set(el, record);
  }
  record.props = props;
  record.root.render(<AgentChatPanel {...props} />);
}

export function mountAgentChat(el: HTMLElement, props: AgentChatPanelProps) {
  renderMount(el, props);
}

export function updateAgentChat(el: HTMLElement, props: Partial<AgentChatPanelProps>) {
  const record = mounts.get(el);
  if (!record) return;
  renderMount(el, { ...record.props, ...props });
}

/** Import persisted messages into the live runtime without tearing down the tree. */
export function syncAgentChatMessages(
  el: HTMLElement,
  messages: AgentChatPanelProps['initialMessages'],
) {
  const record = mounts.get(el);
  if (!record) return;
  renderMount(el, {
    ...record.props,
    initialMessages: messages,
    importMessagesGeneration: (record.props.importMessagesGeneration ?? 0) + 1,
  });
}

export function unmountAgentChat(el: HTMLElement) {
  const record = mounts.get(el);
  if (!record) return;
  record.root.unmount();
  mounts.delete(el);
}

declare global {
  interface Window {
    __reaveAgentChat?: {
      mount: typeof mountAgentChat;
      update: typeof updateAgentChat;
      syncMessages: typeof syncAgentChatMessages;
      unmount: typeof unmountAgentChat;
    };
  }
}

window.__reaveAgentChat = {
  mount: mountAgentChat,
  update: updateAgentChat,
  syncMessages: syncAgentChatMessages,
  unmount: unmountAgentChat,
};

export {};
