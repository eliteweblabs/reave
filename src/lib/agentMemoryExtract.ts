/**
 * Background durable-recall extract — Haiku pass after a successful agent turn.
 * Fire-and-forget: never blocks the chat reply.
 */

import { AUTO_AGENT_MODELS } from './agentModel';
import {
  parseExtractedMemories,
  shouldSkipMemoryExtract,
  type AgentMemory,
} from './agentMemory';
import { notifyAgentMemoryUpdated } from './agentMemoryNotify';
import { storeListMemories, storeUpsertMemory } from './agentMemoryStore';
import { createAnthropicMessage, type AnthropicMessagesResponse } from './anthropicMessages';
import { runWithAgentContext } from './agentContext';
import { createLogger } from './logger';
import { serverEnv } from './serverEnv';

const log = createLogger('memory:extract');

const EXTRACT_SYSTEM = [
  'You extract durable recall items for a business-OS assistant.',
  'KEEP only things that will matter in a FUTURE chat: lasting preferences, procedures already done that should be repeated the same way, client-specific habits, lasting decisions, and stable facts about the owner or the business.',
  'DROP one-off tasks, transient status, secrets/passwords/keys/tokens, guesses, and anything already listed in existing_memories.',
  'Do not invent. If nothing durable was said or done, return {"memories":[]}.',
  'Max 5 items. Each content is one sentence. key is a short dot.slug (e.g. owner.kids, pref.invoice-terms, proc.reggie-invoices).',
  'kind is one of: preference, procedure, fact, decision, client, habit.',
  'scope is "user" for personal facts about the speaker, "install" for shared business preferences/procedures/clients.',
  'Return JSON only: {"memories":[{"kind":"fact","key":"owner.age","content":"Owner is 25 years old.","scope":"user"}]}',
].join(' ');

function textFromAnthropic(data: AnthropicMessagesResponse): string {
  return (data.content ?? [])
    .filter((block): block is { type: 'text'; text: string } => {
      if (!block || typeof block !== 'object') return false;
      const row = block as { type?: unknown; text?: unknown };
      return row.type === 'text' && typeof row.text === 'string';
    })
    .map((block) => block.text)
    .join('\n')
    .trim();
}

async function extractAndStoreMemories(opts: {
  userId: string;
  threadId?: string;
  userText: string;
  assistantText: string;
}): Promise<number> {
  const existing = await storeListMemories({ userId: opts.userId, limit: 80 });
  const existingLines = existing.map((m) => `- ${m.key}: ${m.content}`).join('\n') || '(none)';
  const user = opts.userText.trim().slice(0, 4000);
  const assistant = opts.assistantText.trim().slice(0, 4000);

  const result = await createAnthropicMessage({
    model: AUTO_AGENT_MODELS.light,
    max_tokens: 700,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `existing_memories:\n${existingLines}`,
          `user:\n${user}`,
          `assistant:\n${assistant}`,
        ].join('\n\n'),
      },
    ],
  });

  if (!result.ok) {
    if (result.text !== 'sleep_mode') {
      log.warn('extract call failed', { status: result.status, text: result.text.slice(0, 200) });
    }
    return 0;
  }

  const drafts = parseExtractedMemories(textFromAnthropic(result.data));
  const changed: AgentMemory[] = [];
  let createdAny = false;
  for (const draft of drafts) {
    const upserted = await storeUpsertMemory({
      userId: opts.userId,
      scope: draft.scope,
      kind: draft.kind,
      key: draft.key,
      content: draft.content,
      source: 'extract',
      sourceThreadId: opts.threadId ?? null,
      silent: true,
    });
    if (upserted.ok && upserted.changed) {
      changed.push(upserted.memory);
      if (upserted.created) createdAny = true;
    }
  }
  if (changed.length) {
    log.info('extracted memories', { saved: changed.length, threadId: opts.threadId });
    void notifyAgentMemoryUpdated({
      memories: changed,
      created: createdAny,
    }).catch((e) => log.warn('extract notify failed', e));
  }
  return changed.length;
}

/** Queue a non-blocking extract. Safe to call from the agent finish path. */
export function scheduleAgentMemoryExtract(opts: {
  userText: string;
  assistantText: string;
  userId?: string;
  threadId?: string;
  systemAlert?: boolean;
}): void {
  if (!serverEnv('ANTHROPIC_API_KEY')?.trim()) return;
  const userId = opts.userId?.trim();
  if (!userId) return;
  if (
    shouldSkipMemoryExtract({
      userText: opts.userText,
      assistantText: opts.assistantText,
      systemAlert: opts.systemAlert,
    })
  ) {
    return;
  }

  void runWithAgentContext({ bypassSleepMode: true, userId, threadId: opts.threadId }, () =>
    extractAndStoreMemories({
      userId,
      threadId: opts.threadId,
      userText: opts.userText,
      assistantText: opts.assistantText,
    }),
  ).catch((err) => {
    log.warn('extract failed', { error: err instanceof Error ? err.message : String(err) });
  });
}
