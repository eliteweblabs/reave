/**
 * Deployment owner chat access — consolidates threads orphaned under previous
 * Clerk user ids and resolves thread ownership by id (not only signed-in id).
 */

import {
  storeConsolidateOrphanedChatThreads,
  storeGetChatThread,
  storeGetChatThreadOwnerUserId,
  storeListChatThreads,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from './chatStore';

export async function storeListChatThreadsForOwner(
  signedInUserId: string,
  opts?: { archivedOnly?: boolean },
): Promise<{ threads: ChatThreadSummary[]; consolidated: number }> {
  const consolidated = await storeConsolidateOrphanedChatThreads(signedInUserId);
  const threads = await storeListChatThreads(signedInUserId, opts);
  return { threads, consolidated };
}

export async function storeGetChatThreadForOwner(
  signedInUserId: string,
  threadId: string,
): Promise<ChatThreadDetail | null> {
  await storeConsolidateOrphanedChatThreads(signedInUserId);
  const ownerUserId = await resolveChatThreadOwnerUserId(signedInUserId, threadId);
  if (!ownerUserId) return null;
  return storeGetChatThread(ownerUserId, threadId);
}

/** Resolve which user_id owns a thread for owner-scoped mutations. */
export async function resolveChatThreadOwnerUserId(
  signedInUserId: string,
  threadId: string,
): Promise<string | null> {
  const ownerUserId = await storeGetChatThreadOwnerUserId(threadId);
  if (ownerUserId) return ownerUserId;
  const own = await storeGetChatThread(signedInUserId, threadId);
  return own ? signedInUserId : null;
}
