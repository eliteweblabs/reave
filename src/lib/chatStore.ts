/**
 * Chat storage: Postgres (DATABASE_URL) → Supabase → ephemeral files (dev only).
 */

import type { TelegramChatTurn } from './telegramChatHistory';
import {
  fileAppendChatMessages,
  fileCreateChatThread,
  fileDeleteChatThread,
  fileGetChatThread,
  fileListChatThreads,
  fileUpdateChatTitle,
} from './fileChats';
import {
  isPgChatsConfigured,
  pgAppendChatMessages,
  pgCreateChatThread,
  pgDeleteChatThread,
  pgGetChatThread,
  pgListChatThreads,
  pgUpdateChatTitle,
} from './pgChats';
import {
  dbAppendChatMessages,
  dbCreateChatThread,
  dbDeleteChatThread,
  dbGetChatThread,
  dbListChatThreads,
  dbUpdateChatTitle,
  isSupabaseChatsConfigured,
  titleFromMessage,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from './supabaseChats';

export { isPgChatsConfigured, isSupabaseChatsConfigured, titleFromMessage };
export type { ChatThreadDetail, ChatThreadSummary };

export function chatStorageBackend(): 'postgres' | 'supabase' | 'files' {
  if (isPgChatsConfigured()) return 'postgres';
  if (isSupabaseChatsConfigured()) return 'supabase';
  return 'files';
}

export async function storeListChatThreads(userId: string): Promise<ChatThreadSummary[]> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return (await pgListChatThreads(userId)) ?? [];
  if (backend === 'supabase') return (await dbListChatThreads(userId)) ?? [];
  return fileListChatThreads(userId);
}

export async function storeCreateChatThread(userId: string): Promise<ChatThreadSummary | null> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return pgCreateChatThread(userId);
  if (backend === 'supabase') return dbCreateChatThread(userId);
  return fileCreateChatThread(userId);
}

export async function storeGetChatThread(
  userId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return pgGetChatThread(userId, threadId);
  if (backend === 'supabase') return dbGetChatThread(userId, threadId);
  return fileGetChatThread(userId, threadId);
}

export async function storeAppendChatMessages(
  userId: string,
  threadId: string,
  turns: TelegramChatTurn[]
): Promise<boolean> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return pgAppendChatMessages(threadId, turns);
  if (backend === 'supabase') return dbAppendChatMessages(threadId, turns);
  return fileAppendChatMessages(userId, threadId, turns);
}

export async function storeUpdateChatTitle(
  userId: string,
  threadId: string,
  title: string
): Promise<boolean> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return pgUpdateChatTitle(threadId, title);
  if (backend === 'supabase') return dbUpdateChatTitle(threadId, title);
  return fileUpdateChatTitle(userId, threadId, title);
}

export async function storeDeleteChatThread(userId: string, threadId: string): Promise<boolean> {
  const backend = chatStorageBackend();
  if (backend === 'postgres') return pgDeleteChatThread(userId, threadId);
  if (backend === 'supabase') return dbDeleteChatThread(userId, threadId);
  return fileDeleteChatThread(userId, threadId);
}
