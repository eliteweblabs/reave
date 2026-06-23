/**
 * Chat storage: Supabase when configured, otherwise markdown files (like todo).
 */

import type { TelegramChatTurn } from './telegramChatHistory';
import {
  dbAppendChatMessages,
  dbCreateChatThread,
  dbGetChatThread,
  dbListChatThreads,
  dbUpdateChatTitle,
  isSupabaseChatsConfigured,
  titleFromMessage,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from './supabaseChats';
import {
  fileAppendChatMessages,
  fileCreateChatThread,
  fileGetChatThread,
  fileListChatThreads,
  fileUpdateChatTitle,
} from './fileChats';

export { isSupabaseChatsConfigured, titleFromMessage };
export type { ChatThreadDetail, ChatThreadSummary };

export function chatStorageBackend(): 'supabase' | 'files' {
  return isSupabaseChatsConfigured() ? 'supabase' : 'files';
}

export async function storeListChatThreads(userId: string): Promise<ChatThreadSummary[]> {
  if (chatStorageBackend() === 'supabase') {
    return (await dbListChatThreads(userId)) ?? [];
  }
  return fileListChatThreads(userId);
}

export async function storeCreateChatThread(userId: string): Promise<ChatThreadSummary | null> {
  if (chatStorageBackend() === 'supabase') {
    return dbCreateChatThread(userId);
  }
  return fileCreateChatThread(userId);
}

export async function storeGetChatThread(
  userId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  if (chatStorageBackend() === 'supabase') {
    return dbGetChatThread(userId, threadId);
  }
  return fileGetChatThread(userId, threadId);
}

export async function storeAppendChatMessages(
  userId: string,
  threadId: string,
  turns: TelegramChatTurn[]
): Promise<boolean> {
  if (chatStorageBackend() === 'supabase') {
    return dbAppendChatMessages(threadId, turns);
  }
  return fileAppendChatMessages(userId, threadId, turns);
}

export async function storeUpdateChatTitle(
  userId: string,
  threadId: string,
  title: string
): Promise<boolean> {
  if (chatStorageBackend() === 'supabase') {
    return dbUpdateChatTitle(threadId, title);
  }
  return fileUpdateChatTitle(userId, threadId, title);
}
