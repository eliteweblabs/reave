/**
 * Chat storage: Postgres (DATABASE_URL) → ephemeral files (dev only).
 */

import type { ChatTurn } from './chatTypes';
import {
  fileAppendChatMessages,
  fileConsolidateOrphanedChatThreads,
  fileCreateChatThread,
  fileDeleteChatThread,
  fileGetChatSummaryById,
  fileGetChatThread,
  fileGetChatThreadOwnerUserId,
  fileListChatThreads,
  fileMarkChatSeen,
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
  pgGetChatThreadOwnerUserId,
  pgListChatThreadOwners,
  pgListChatThreads,
  pgMarkChatSeen,
  pgReassignChatThreads,
  pgSetChatArchived,
  pgUpdateChatTitle,
  type ChatThreadOwner,
} from './pgChats';
import {
  deriveChatTitleFromThread,
  truncateChatTitle,
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
  const normalized = truncateChatTitle(title);
  if (chatStorageBackend() === 'postgres') return pgUpdateChatTitle(threadId, normalized);
  return fileUpdateChatTitle(userId, threadId, normalized);
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

/**
 * Persist "seen up to `seenAt`" for a thread server-side, so the unread dot
 * agrees across every device signed in as this user (see pgMarkChatSeen).
 */
export async function storeMarkChatSeen(
  userId: string,
  threadId: string,
  seenAt?: string,
): Promise<string | null> {
  if (chatStorageBackend() === 'postgres') return pgMarkChatSeen(userId, threadId, seenAt);
  return fileMarkChatSeen(userId, threadId, seenAt);
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

/** Clerk user id that owns a thread (ignores the signed-in id filter). */
export async function storeGetChatThreadOwnerUserId(threadId: string): Promise<string | null> {
  const id = threadId.trim();
  if (!id) return null;
  if (chatStorageBackend() === 'postgres') return pgGetChatThreadOwnerUserId(id);
  return fileGetChatThreadOwnerUserId(id);
}

/**
 * Move chat threads orphaned under previous Clerk user ids onto the current
 * deployment owner. Safe on every list — no-ops when everything already matches.
 */
export async function storeConsolidateOrphanedChatThreads(toUserId: string): Promise<number> {
  const to = toUserId.trim();
  if (!to) return 0;

  if (chatStorageBackend() === 'postgres') {
    const owners = await pgListChatThreadOwners();
    if (!owners?.length) return 0;
    let moved = 0;
    for (const owner of owners) {
      if (owner.userId === to) continue;
      const count = await pgReassignChatThreads(owner.userId, to);
      if (count) moved += count;
    }
    if (moved > 0) {
      console.info('[chats] consolidated orphaned threads', { toUserId: to, moved });
    }
    return moved;
  }

  const moved = fileConsolidateOrphanedChatThreads(to);
  if (moved > 0) {
    console.info('[chats] consolidated orphaned file threads', { toUserId: to, moved });
  }
  return moved;
}
