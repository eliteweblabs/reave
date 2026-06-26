import type { TelegramChatTurn } from './telegramChatHistory';

export interface ChatThreadSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: TelegramChatTurn['role'];
  content: string;
  created_at: string;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatMessage[];
}

export function titleFromMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return 'New chat';
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}
