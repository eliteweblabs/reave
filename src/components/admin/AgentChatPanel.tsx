import React, { useEffect, useRef, useState } from "react";
import type { Message } from "@/types/index";

interface AgentChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
}) => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = newHeight + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput("");
    }
  };

  const handleClear = () => {
    setInput("");
    inputRef.current?.blur();
  };

  return (
    <div className="agent-chat-panel">
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="message message-assistant">
            <div className="message-content">
              <span className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-compose">
        <div className="compose-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message..."
            className="compose-input"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={handleClear}
            className="clear-button"
            title="Clear input"
            disabled={!input || isLoading}
            aria-label="Clear input"
          >
            ✕
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="send-button"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AgentChatPanel;
