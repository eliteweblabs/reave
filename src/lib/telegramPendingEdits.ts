/**
 * Tracks a single "waiting for the next chat message" intent per Telegram chat.
 *
 * Used by the /contacts → Meta edit flow: the user taps a field button (e.g.
 * "Email"), we stash what they're editing here, then the next plain-text message
 * they send is consumed as the new value. In-memory only (resets on restart),
 * matching telegramChatHistory.
 */

export type MetaField = 'firstname' | 'lastname' | 'company' | 'phone' | 'email';

export type PendingEdit = {
  uid: string;
  /** Which contact field the next message should set. */
  field: MetaField;
  /** Display name, for friendly prompts/confirmations. */
  name: string;
  createdAt: number;
};

/** How long a pending edit stays valid before it's ignored (avoids stale captures). */
const TTL_MS = 10 * 60 * 1000;

const byChat = new Map<number, PendingEdit>();

export function setPendingEdit(chatId: number, edit: Omit<PendingEdit, 'createdAt'>): void {
  byChat.set(chatId, { ...edit, createdAt: Date.now() });
}

/** Look without consuming. Returns null if absent or expired. */
export function peekPendingEdit(chatId: number): PendingEdit | null {
  const e = byChat.get(chatId);
  if (!e) return null;
  if (Date.now() - e.createdAt > TTL_MS) {
    byChat.delete(chatId);
    return null;
  }
  return e;
}

/** Read and remove in one step. Returns null if absent or expired. */
export function takePendingEdit(chatId: number): PendingEdit | null {
  const e = peekPendingEdit(chatId);
  if (e) byChat.delete(chatId);
  return e;
}

export function clearPendingEdit(chatId: number): void {
  byChat.delete(chatId);
}
