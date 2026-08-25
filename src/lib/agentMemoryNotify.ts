/**
 * Phone + dashboard notify when the agent writes durable recall.
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

  const payload = formatMemoryUpdateNotification({
    memories,
    created: opts.created,
  });

  await sendPushNotification({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url,
    kind: 'system',
  }).catch((e) => log.warn('memory push failed', e));
}
