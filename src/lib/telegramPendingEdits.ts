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

/**
 * Disambiguating a risky first/last-name edit. Raised when the user sets a
 * person-name part on a contact whose `name` looks like a *business* (and has no
 * Company set) — applying it would rewrite the business name. We stash the typed
 * value and wait for the user to tap how to resolve it (see qcmd:metafix:*).
 */
export type MetaConfirmPending = BasePending & {
  kind: 'metaconfirm';
  /** Which name part the user was setting. */
  field: 'firstname' | 'lastname';
  /** The value the user typed (their intended first/last name). */
  value: string;
  /** The contact's current `name` — the value that looks like a business. */
  currentName: string;
};

/** Adding a portal note — collect a title, then the content, over two messages. */
export type NotePending = BasePending & {
  kind: 'note';
  step: 'title' | 'content';
  /** Captured title, present once step advances to 'content'. */
  title?: string;
};

/** Adding a line item to an invoice — the next message is the item. */
export type InvoicePending = BasePending & {
  kind: 'invoice';
  /** Existing draft invoice id to append to, or undefined to create a new one. */
  invoiceId?: number;
  /** Crater customer name (used when creating a new invoice). */
  customerName: string;
};

/**
 * Creating a brand-new contact from the /contacts list "Add New" button. There's
 * no uid yet, so this stands apart from BasePending — the next message holds the
 * new contact's details ("Name | email | phone | company").
 */
export type NewContactPending = {
  kind: 'newcontact';
  createdAt: number;
};

export type PendingEdit =
  | MetaPending
  | MetaConfirmPending
  | NotePending
  | InvoicePending
  | NewContactPending;

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
