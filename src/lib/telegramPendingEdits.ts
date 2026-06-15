/**
 * Tracks a single "waiting for the next chat message" intent per Telegram chat.
 *
 * Used by the /contacts → Meta edit flow (tap a field button, the next plain-text
 * message is the new value) and the Notes → Add flow (a two-step capture: first
 * the note title, then its content). In-memory only (resets on restart), matching
 * telegramChatHistory.
 */

export type MetaField = 'firstname' | 'lastname' | 'company' | 'phone' | 'email';

type BasePending = {
  uid: string;
  /** Display name, for friendly prompts/confirmations. */
  name: string;
  createdAt: number;
};

/** Editing one contact meta field — the next message is the new value. */
export type MetaPending = BasePending & { kind: 'meta'; field: MetaField };

/** Adding a portal note — collect a title, then the content, over two messages. */
export type NotePending = BasePending & {
  kind: 'note';
  step: 'title' | 'content';
  /** Captured title, present once step advances to 'content'. */
  title?: string;
};

export type PendingEdit = MetaPending | NotePending;

/** How long a pending edit stays valid before it's ignored (avoids stale captures). */
const TTL_MS = 10 * 60 * 1000;

const byChat = new Map<number, PendingEdit>();

/** Distributive Omit so each union member keeps its own discriminant fields. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export function setPendingEdit(
  chatId: number,
  edit: DistributiveOmit<PendingEdit, 'createdAt'>
): void {
  byChat.set(chatId, { ...edit, createdAt: Date.now() } as PendingEdit);
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
