/**
 * Phone / PWA push when the agent writes durable recall.
 * Dashboard cards stay off — tap the push to open chats.
 * Owner edits and identical re-saves stay quiet.
 */

import { formatMemoryUpdateNotification, type AgentMemory } from './agentMemory';
import { createLogger } from './logger';
import { sendPushNotification } from './webPush';

const log = createLogger('memory:notify');

export async function notifyAgentMemoryUpdated(opts: {
  memories: AgentMemory[];
  created?: boolean;
}): Promise<void> {
  const memories = opts.memories.filter((m) => m.content?.trim());
  if (!memories.length) return;

  const threadId = memories.find((m) => m.source_thread_id)?.source_thread_id ?? null;
  const payload = formatMemoryUpdateNotification({
    memories,
    created: opts.created,
    threadId,
  });

  await sendPushNotification({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url,
    kind: 'system',
    skipDashboardAlert: true,
  }).catch((e) => log.warn('memory push failed', e));
}
