/**
 * Example: How to integrate ChatButton rendering into your chat message component
 * 
 * This shows the pattern for parsing agent responses and rendering buttons
 */

import React from 'react';
import { useChatRenderer } from '@/hooks/useChatRenderer';
import { ChatButton } from '@/components/ChatButton';
import { getButtonProps } from '@/lib/chatResponseRenderer';

interface ChatMessageProps {
  content: string;
  role: 'user' | 'assistant';
}

/**
 * Render a chat message with optional structured button responses
 */
export const ChatMessageWithButtons: React.FC<ChatMessageProps> = ({ content, role }) => {
  const { text, buttons } = useChatRenderer(content);

  // Don't render buttons for user messages
  if (role === 'user') {
    return <div className="text-gray-900">{text}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Main message text */}
      {text && <div className="text-gray-900 leading-relaxed">{text}</div>}

      {/* Rendered buttons */}
      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {buttons.map((button, idx) => (
            <ChatButton
              key={idx}
              {...getButtonProps(button)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatMessageWithButtons;

/**
 * Example agent response that would be parsed:
 * 
 * "Here's the project you requested:
 * 
 * \`\`\`json
 * {
 *   "type": "button",
 *   "label": "ALP Connect – Website Review",
 *   "href": "https://reave.app/work/website-review-for-alp-connect",
 *   "variant": "primary"
 * }
 * \`\`\`
 * 
 * Let me know if you need anything else!"
 */
