/**
 * Deployment owner may have chat threads under AGENT_ALERT_USER_ID (system
 * alerts, Siri audit logs) that differ from their current signed-in Clerk id
 * after a key rotation — merge both when listing or opening threads.
 */

import { agentAlertUserId } from './adminAgentAlert';
import {
  storeGetChatThread,
  storeListChatThreads,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from './chatStore';

/** Clerk user ids whose chat threads the signed-in owner may access. */
export function ownerChatUserIds(signedInUserId: string): string[] {
  const primary = signedInUserId.trim();
  const ids = primary ? [primary] : [];
  const alertId = agentAlertUserId()?.trim();
  if (alertId && !ids.includes(alertId)) ids.push(alertId);
  return ids;
}

export async function storeListChatThreadsForOwner(
  signedInUserId: string,
  opts?: { archivedOnly?: boolean },
): Promise<ChatThreadSummary[]> {
  const userIds = ownerChatUserIds(signedInUserId);
  if (userIds.length <= 1) {
    return storeListChatThreads(userIds[0] ?? signedInUserId, opts);
  }

  const lists = await Promise.all(userIds.map((id) => storeListChatThreads(id, opts)));
  const byId = new Map<string, ChatThreadSummary>();
  for (const list of lists) {
    for (const thread of list) {
      if (!byId.has(thread.id)) byId.set(thread.id, thread);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export async function storeGetChatThreadForOwner(
  signedInUserId: string,
  threadId: string,
): Promise<ChatThreadDetail | null> {
  for (const userId of ownerChatUserIds(signedInUserId)) {
    const thread = await storeGetChatThread(userId, threadId);
    if (thread) return thread;
  }
  return null;
}

/** Resolve which user_id owns a thread for owner-scoped mutations. */
export async function resolveChatThreadOwnerUserId(
  signedInUserId: string,
  threadId: string,
): Promise<string | null> {
  for (const userId of ownerChatUserIds(signedInUserId)) {
    const thread = await storeGetChatThread(userId, threadId);
    if (thread) return userId;
  }
  return null;
}
