/**
 * Chat storage: Postgres (DATABASE_URL) → ephemeral files (dev only).
 */

import type { ChatTurn } from './chatTypes';
import {
  fileAppendChatMessages,
  fileCreateChatThread,
  fileDeleteChatThread,
  fileGetChatSummaryById,
  fileGetChatThread,
  fileListChatThreads,
  fileSetChatArchived,
  fileUpdateChatTitle,
} from './fileChats';
import {
  isPgChatsConfigured,
  pgAppendChatMessages,
  pgCreateChatThread,
  pgDeleteChatThread,
  pgGetChatSummaryById,
  pgGetChatThread,
  pgListChatThreadOwners,
  pgListChatThreads,
  pgReassignChatThreads,
  pgSetChatArchived,
  pgUpdateChatTitle,
  type ChatThreadOwner,
} from './pgChats';
import {
  deriveChatTitleFromThread,
  titleFromMessage,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from './chatTypes';

export { isPgChatsConfigured, titleFromMessage };
export type { ChatThreadDetail, ChatThreadSummary, ChatThreadOwner };

export function chatStorageBackend(): 'postgres' | 'files' {
  if (isPgChatsConfigured()) return 'postgres';
  return 'files';
}

export async function storeListChatThreads(
  userId: string,
  opts?: { archivedOnly?: boolean },
): Promise<ChatThreadSummary[]> {
  if (chatStorageBackend() === 'postgres') {
    return (await pgListChatThreads(userId, opts)) ?? [];
  }
  return fileListChatThreads(userId, opts);
}

export async function storeCreateChatThread(
  userId: string,
  opts?: { sourceEmailId?: string | null },
): Promise<ChatThreadSummary | null> {
  if (chatStorageBackend() === 'postgres') return pgCreateChatThread(userId, opts);
  return fileCreateChatThread(userId);
}

export async function storeGetChatThread(
  userId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  if (chatStorageBackend() === 'postgres') return pgGetChatThread(userId, threadId);
  return fileGetChatThread(userId, threadId);
}

export async function storeAppendChatMessages(
  userId: string,
  threadId: string,
  turns: ChatTurn[]
): Promise<boolean> {
  if (chatStorageBackend() === 'postgres') return pgAppendChatMessages(threadId, turns);
  return fileAppendChatMessages(userId, threadId, turns);
}

export async function storeUpdateChatTitle(
  userId: string,
  threadId: string,
  title: string
): Promise<boolean> {
  if (chatStorageBackend() === 'postgres') return pgUpdateChatTitle(threadId, title);
  return fileUpdateChatTitle(userId, threadId, title);
}

/** Set a title from the first user (or assistant) message when still untitled. */
export async function storeEnsureChatTitle(
  userId: string,
  threadId: string,
): Promise<string | null> {
  const thread = await storeGetChatThread(userId, threadId);
  if (!thread) return null;
  const title = deriveChatTitleFromThread(thread);
  if (!title) return null;
  const updated = await storeUpdateChatTitle(userId, threadId, title);
  return updated ? title : null;
}

export async function storeDeleteChatThread(userId: string, threadId: string): Promise<boolean> {
  if (chatStorageBackend() === 'postgres') return pgDeleteChatThread(userId, threadId);
  return fileDeleteChatThread(userId, threadId);
}

export async function storeSetChatArchived(
  userId: string,
  threadId: string,
  archived: boolean,
): Promise<boolean> {
  if (chatStorageBackend() === 'postgres') return pgSetChatArchived(userId, threadId, archived);
  return fileSetChatArchived(userId, threadId, archived);
}

export async function storeGetChatSummaryById(
  threadId: string,
): Promise<{ id: string; title: string; updatedAt: string } | null> {
  const id = threadId.trim();
  if (!id) return null;
  if (chatStorageBackend() === 'postgres') return pgGetChatSummaryById(id);
  return fileGetChatSummaryById(id);
}

/**
 * Owner-only recovery helpers. Only available on the Postgres backend; the
 * file backend returns null so callers can surface an "unsupported" message.
 */
export async function storeListChatThreadOwners(): Promise<ChatThreadOwner[] | null> {
  if (chatStorageBackend() === 'postgres') return pgListChatThreadOwners();
  return null;
}

export async function storeReassignChatThreads(
  fromUserId: string,
  toUserId: string,
): Promise<number | null> {
  if (chatStorageBackend() === 'postgres') return pgReassignChatThreads(fromUserId, toUserId);
  return null;
}
