/**
 * Durable recall tools — remember / list / search / forget across chats.
 */

import { getAgentContext } from '../../agentContext';
import {
  inferMemoryScope,
  isUsableMemoryContent,
  normalizeMemoryContent,
  normalizeMemoryKey,
  normalizeMemoryKind,
  normalizeMemoryScope,
} from '../../agentMemory';
import {
  storeDeleteMemory,
  storeListMemories,
  storeUpsertMemory,
} from '../../agentMemoryStore';
import type { AgentToolModule } from '../types';

function currentUserId(): string | null {
  return getAgentContext().userId?.trim() || null;
}

function currentThreadId(): string | null {
  return getAgentContext().threadId?.trim() || null;
}

export const memoryModule: AgentToolModule = {
  id: 'memory',
  enabled: () => true,
  definitions: () => [
    {
      type: 'function',
      function: {
        name: 'remember',
        description:
          'Save a lasting preference, procedure, client habit, decision, or stable fact so it is available in future chats without the owner repeating it. Use this in the same turn you learn something durable — do not wait for "remember this." Skip one-offs, secrets, and things already in the Durable recall block.',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'One sentence the future chat should already know.',
            },
            kind: {
              type: 'string',
              enum: ['preference', 'procedure', 'fact', 'decision', 'client', 'habit'],
              description: 'What kind of recall this is (default fact).',
            },
            key: {
              type: 'string',
              description: 'Optional stable slug, e.g. "owner.kids" or "pref.invoice-terms".',
            },
            scope: {
              type: 'string',
              enum: ['user', 'install'],
              description:
                'user = personal to this admin; install = shared business habit. Omit to infer.',
            },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_memories',
        description:
          'List durable recall items already saved for this install / admin. Use when the owner asks what you remember, or before changing a stored note.',
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['preference', 'procedure', 'fact', 'decision', 'client', 'habit'],
            },
            limit: { type: 'number', description: 'Max items (default 40, max 80)' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_memories',
        description:
          'Search durable recall by keyword when something might have been mentioned or done in an earlier chat but is not in the injected block.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords or a short phrase' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'forget_memory',
        description:
          'Delete a stored recall item when the owner says it is wrong, outdated, or should not be kept. Match by id or key from list_memories / search_memories.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Memory id from list_memories' },
            key: { type: 'string', description: 'Stable slug, e.g. owner.kids' },
          },
          additionalProperties: false,
        },
      },
    },
  ],
  handlers: {
    remember: async (args) => {
      const userId = currentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });
      const content = normalizeMemoryContent(args.content);
      if (!isUsableMemoryContent(content)) {
        return JSON.stringify({
          error: 'content is missing, too short, or looks like a secret — not saved',
        });
      }
      const kind = normalizeMemoryKind(args.kind);
      const scope = args.scope
        ? normalizeMemoryScope(args.scope, kind)
        : inferMemoryScope(kind, content);
      const key = normalizeMemoryKey(args.key, `${kind}.${content}`);
      const result = await storeUpsertMemory({
        userId,
        scope,
        kind,
        key,
        content,
        source: 'agent',
        sourceThreadId: currentThreadId(),
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({
        ok: true,
        created: result.created,
        memory: {
          id: result.memory.id,
          key: result.memory.key,
          kind: result.memory.kind,
          scope: result.memory.scope,
          content: result.memory.content,
        },
      });
    },

    list_memories: async (args) => {
      const userId = currentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });
      const kind = typeof args.kind === 'string' ? normalizeMemoryKind(args.kind) : undefined;
      const rawLimit = args.limit != null ? Number(args.limit) : 40;
      const limit = Math.min(Math.max(1, rawLimit || 40), 80);
      const memories = await storeListMemories({ userId, kind, limit });
      return JSON.stringify({
        ok: true,
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          key: m.key,
          kind: m.kind,
          scope: m.scope,
          content: m.content,
          updated_at: m.updated_at,
        })),
      });
    },

    search_memories: async (args) => {
      const userId = currentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return JSON.stringify({ error: 'query is required' });
      const memories = await storeListMemories({ userId, query, limit: 20 });
      return JSON.stringify({
        ok: true,
        query,
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          key: m.key,
          kind: m.kind,
          scope: m.scope,
          content: m.content,
        })),
      });
    },

    forget_memory: async (args) => {
      const userId = currentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });
      const id = args.id != null ? Number(args.id) : undefined;
      const key = typeof args.key === 'string' ? args.key.trim() : undefined;
      if (!id && !key) return JSON.stringify({ error: 'id or key is required' });
      const result = await storeDeleteMemory({ userId, id, key });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify({ ok: true, deleted: result.deleted });
    },
  },
};
