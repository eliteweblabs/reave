/**
 * Chat Response Renderer
 * Converts structured agent response data into renderable components
 * 
 * Usage in agent responses:
 * {
 *   type: 'button',
 *   label: 'ALP Connect – Website Review',
 *   href: 'https://reave.app/work/website-review-for-alp-connect',
 *   variant?: 'primary' | 'secondary' | 'outline'
 * }
 */

export interface ChatButtonResponse {
  type: 'button';
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  target?: '_blank' | '_self';
}

export interface ChatActionResponse {
  type: 'action';
  action: string;
  params?: Record<string, any>;
}

export type StructuredChatResponse = ChatButtonResponse | ChatActionResponse | any;

/**
 * Check if a message contains structured response data
 * Agent can embed JSON in responses or return as structured data
 */
export const extractStructuredResponses = (text: string): StructuredChatResponse[] => {
  const responses: StructuredChatResponse[] = [];
  
  // Look for JSON-LD style blocks or explicit markers
  const jsonRegex = /```json\n?([\s\S]*?)\n?```/g;
  let match;
  
  while ((match = jsonRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        responses.push(...parsed);
      } else {
        responses.push(parsed);
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return responses;
};

/**
 * Check if response is a button render request
 */
export const isButtonResponse = (data: any): data is ChatButtonResponse => {
  return data?.type === 'button' && typeof data?.label === 'string' && typeof data?.href === 'string';
};

/**
 * Generate props object for ChatButton component from response
 */
export const getButtonProps = (response: ChatButtonResponse) => {
  return {
    label: response.label,
    href: response.href,
    variant: response.variant || 'primary',
    size: response.size || 'md',
    target: response.target || '_blank',
  };
};

/**
 * Helper to embed a button render instruction in agent text
 * Agent can call this mentally to format responses
 * 
 * Example:
 * "Here's your project: " + renderButton('ALP Connect', 'https://reave.app/work/...')
 */
export const renderButton = (label: string, href: string, variant: 'primary' | 'secondary' | 'outline' = 'primary'): string => {
  return `\`\`\`json\n${JSON.stringify({ type: 'button', label, href, variant })}\n\`\`\``;
};

export default {
  extractStructuredResponses,
  isButtonResponse,
  getButtonProps,
  renderButton,
};
