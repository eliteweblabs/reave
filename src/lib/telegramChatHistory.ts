export type TelegramChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const DEFAULT_MAX_TURNS = 20;

const historyByChat = new Map<number, TelegramChatTurn[]>();

function maxTurns(): number {
  const raw = import.meta.env.TELEGRAM_CHAT_HISTORY_TURNS;
  if (!raw?.trim()) return DEFAULT_MAX_TURNS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_TURNS;
}

function trimTurns(turns: TelegramChatTurn[]): TelegramChatTurn[] {
  const cap = maxTurns();
  if (turns.length <= cap) return turns;
  return turns.slice(-cap);
}

export function getChatHistory(chatId: number): TelegramChatTurn[] {
  return historyByChat.get(chatId) ?? [];
}

export function appendChatTurns(chatId: number, turns: TelegramChatTurn[]): void {
  if (!turns.length) return;
  const next = trimTurns([...getChatHistory(chatId), ...turns]);
  historyByChat.set(chatId, next);
}

export function clearChatHistory(chatId: number): void {
  historyByChat.delete(chatId);
}
