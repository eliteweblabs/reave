import { useMemo } from 'react';
import { parseAssistantChatButtons, type ChatButtonResponse } from '../lib/chatResponseRenderer';

export type UseChatRendererResult = {
  text: string;
  buttons: ChatButtonResponse[];
  hasStructured: boolean;
};

export type UseChatRendererOptions = {
  /** Skip JSON button extraction (use while SSE text is still streaming). */
  skipStructured?: boolean;
};

/** Parse assistant message text and extract optional structured button blocks. */
export function useChatRenderer(
  content: string,
  options?: UseChatRendererOptions,
): UseChatRendererResult {
  const skipStructured = options?.skipStructured ?? false;
  return useMemo(() => {
    if (skipStructured) {
      return { text: content, buttons: [], hasStructured: false };
    }
    const { text, buttons } = parseAssistantChatButtons(content);
    return {
      text,
      buttons,
      hasStructured: buttons.length > 0,
    };
  }, [content, skipStructured]);
}
