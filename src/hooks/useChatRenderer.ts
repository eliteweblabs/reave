import { useMemo } from 'react';
import {
  parseAssistantChatButtons,
  type ChatButtonResponse,
  type ChatPreviewResponse,
} from '../lib/chatResponseRenderer';

export type UseChatRendererResult = {
  text: string;
  buttons: ChatButtonResponse[];
  previews: ChatPreviewResponse[];
  hasStructured: boolean;
};

export type UseChatRendererOptions = {
  /** Skip JSON button extraction (use while SSE text is still streaming). */
  skipStructured?: boolean;
};

/** Parse assistant message text and extract optional structured button/preview blocks. */
export function useChatRenderer(
  content: string,
  options?: UseChatRendererOptions,
): UseChatRendererResult {
  const skipStructured = options?.skipStructured ?? false;
  return useMemo(() => {
    if (skipStructured) {
      return { text: content, buttons: [], previews: [], hasStructured: false };
    }
    const { text, buttons, previews } = parseAssistantChatButtons(content);
    return {
      text,
      buttons,
      previews,
      hasStructured: buttons.length > 0 || previews.length > 0,
    };
  }, [content, skipStructured]);
}
