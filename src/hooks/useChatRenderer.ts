import { useMemo } from 'react';
import { parseAssistantChatButtons, type ChatButtonResponse } from '../lib/chatResponseRenderer';

export type UseChatRendererResult = {
  text: string;
  buttons: ChatButtonResponse[];
  hasStructured: boolean;
};

/** Parse assistant message text and extract optional structured button blocks. */
export function useChatRenderer(content: string): UseChatRendererResult {
  return useMemo(() => {
    const { text, buttons } = parseAssistantChatButtons(content);
    return {
      text,
      buttons,
      hasStructured: buttons.length > 0,
    };
  }, [content]);
}
