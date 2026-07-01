/**
 * Chat storage: Postgres (DATABASE_URL) → ephemeral files (dev only).
 */

import type { ChatTurn } from './chatTypes';
import {
  fileAppendChatMessages,
  fileCreateChatThread,
  fileDeleteChatThread,
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
  pgGetChatThread,
  pgListChatThreads,
  pgSetChatArchived,
  pgUpdateChatTitle,
} from './pgChats';
import { titleFromMessage, type ChatThreadDetail, type ChatThreadSummary } from './chatTypes';

export { isPgChatsConfigured, titleFromMessage };
export type { ChatThreadDetail, ChatThreadSummary };

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
