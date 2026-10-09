/** Keep in sync with public/admin/chat-panel.js CHAT_COMPOSE_DRAFT_KEY. */
export const CHAT_COMPOSE_DRAFT_KEY = 'reave:chat-compose-draft';

/** Hold compose protection across iOS dictation pauses between phrases. */
export const CHAT_COMPOSING_ARM_MS = 3_200;

type ReaveComposeWindow = Window & {
  __reaveChatComposing?: boolean;
  __reaveChatComposingTimer?: ReturnType<typeof setTimeout>;
};

/** True when `text` is just the last already-sent user bubble — not an unsent draft. */
export function isSentComposerEcho(text: string, lastUserText: string): boolean {
  const a = text.trim();
  return Boolean(a) && a === lastUserText.trim();
}

export function readChatComposeDraftForThread(threadId: string): string {
  if (!threadId || typeof sessionStorage === 'undefined') return '';
  try {
    const raw = sessionStorage.getItem(CHAT_COMPOSE_DRAFT_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return '';
    const text = parsed[threadId];
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}

/** Extend the “voice/IME in progress” guard so sidebar/pane sync does not tear down mid-dictation. */
export function armReaveChatComposing(ms = CHAT_COMPOSING_ARM_MS): void {
  if (typeof window === 'undefined') return;
  const w = window as ReaveComposeWindow;
  w.__reaveChatComposing = true;
  try {
    window.dispatchEvent(new CustomEvent('reave:chat-compose-active', { detail: true }));
  } catch {
    /* ignore */
  }
  if (w.__reaveChatComposingTimer) clearTimeout(w.__reaveChatComposingTimer);
  w.__reaveChatComposingTimer = setTimeout(() => {
    w.__reaveChatComposingTimer = undefined;
    w.__reaveChatComposing = false;
  }, ms);
}

export function isVoiceOrDictationInputType(inputType: string): boolean {
  if (!inputType) return false;
  if (/dictation|voice|speech|handwriting|transcript/i.test(inputType)) return true;
  return (
    inputType === 'insertReplacementText' ||
    inputType === 'insertFromDictation' ||
    inputType === 'insertFromAlternative' ||
    inputType === 'insertFromYomi'
  );
}
