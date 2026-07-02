import { useMemo } from 'react';
import {
  extractStructuredResponses,
  isButtonResponse,
  type StructuredChatResponse,
  type ChatButtonResponse,
} from '@/lib/chatResponseRenderer';

interface UseChatRendererResult {
  text: string;
  buttons: ChatButtonResponse[];
  hasStructured: boolean;
}

/**
 * Hook to parse agent responses and extract structured button data
 * 
 * Usage in chat message component:
 * const { text, buttons } = useChatRenderer(messageContent);
 * 
 * Return value:
 * - text: cleaned message (JSON blocks removed if desired)
 * - buttons: array of button render instructions
 * - hasStructured: whether any structured data was found
 */
export const useChatRenderer = (content: string): UseChatRendererResult => {
  return useMemo(() => {
    const structured = extractStructuredResponses(content);
    const buttons = structured.filter(isButtonResponse) as ChatButtonResponse[];
    
    // Optionally remove JSON blocks from display text
    // Set to false if you want to keep them inline
    const removeJsonBlocks = true;
    const cleanText = removeJsonBlocks
      ? content.replace(/```json\n?[\s\S]*?\n?```\n?/g, '').trim()
      : content;

    return {
      text: cleanText,
      buttons,
      hasStructured: structured.length > 0,
    };
  }, [content]);
};

export default useChatRenderer;
