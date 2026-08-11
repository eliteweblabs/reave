/**
 * Chat / session management tools for the admin agent.
 *
 * Tools:
 *   list_chats          — recent active sessions (title, date, message count)
 *   list_archived_chats — sessions previously archived
 *   get_chat            — full message history for one thread
 *   search_chats        — search session titles (active or archived)
 *   archive_chat        — move a thread to the archive (default: current thread)
 *   unarchive_chat      — restore an archived thread
 *   rename_chat         — update the title of a thread
 *   delete_chat         — permanently delete a thread and all its messages
 */

import {
  isPgChatsConfigured,
  pgListChatThreads,
  pgGetChatThread,
  pgSetChatArchived,
  pgDeleteChatThread,
  pgUpdateChatTitle,
  type ChatThreadSummary,
} from '../../pgChats';
import { getAgentContext } from '../../agentContext';
import type { AgentToolModule } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isConfigured(): boolean {
  return isPgChatsConfigured();
}

function getCurrentThreadId(): string | null {
  return getAgentContext().threadId ?? null;
}

function getCurrentUserId(): string | null {
  return getAgentContext().userId ?? null;
}

function summarizeThread(t: ChatThreadSummary) {
  return {
    id: t.id,
    title: t.title,
    archived: t.archived,
    updated_at: t.updated_at,
    created_at: t.created_at,
    source_email_id: t.source_email_id ?? null,
    last_role: t.last_role ?? null,
  };
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const chatsModule: AgentToolModule = {
  id: 'chats',

  enabled: () => isConfigured(),

  definitions: () => [
    // ------------------------------------------------------------------
    // list_chats
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'list_chats',
        description:
          'List recent active (non-archived) admin chat sessions. Returns title, id, dates, and last-message role. Use to find a session by name/date before renaming, archiving, or deleting.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max sessions to return (default 20, max 100)',
            },
          },
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // list_archived_chats
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'list_archived_chats',
        description:
          'List admin chat sessions that have been archived. Useful for reviewing, restoring, or permanently deleting old sessions.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max sessions to return (default 20, max 100)',
            },
          },
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // get_chat
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'get_chat',
        description:
          'Fetch the full message history for a chat session by thread_id. Use list_chats first to find the id. Omit thread_id to read the current session.',
        parameters: {
          type: 'object',
          properties: {
            thread_id: {
              type: 'string',
              description: 'Chat thread UUID. Omit to use the current session.',
            },
          },
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // search_chats
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'search_chats',
        description:
          'Search chat session titles by keyword. Checks both active and archived sessions by default.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Keyword(s) to match against session titles',
            },
            include_archived: {
              type: 'boolean',
              description: 'Also search archived sessions (default true)',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // archive_chat
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'archive_chat',
        description:
          'Archive a chat session so it no longer appears in the active sidebar. Omit thread_id to archive the current session (e.g. call this automatically after an audit or completed workflow).',
        parameters: {
          type: 'object',
          properties: {
            thread_id: {
              type: 'string',
              description:
                'Thread UUID to archive. Omit to archive the current session.',
            },
          },
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // unarchive_chat
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'unarchive_chat',
        description:
          'Restore an archived chat session back to the active sidebar. Use list_archived_chats to find the thread_id first.',
        parameters: {
          type: 'object',
          properties: {
            thread_id: {
              type: 'string',
              description: 'Thread UUID to unarchive.',
            },
          },
          required: ['thread_id'],
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // rename_chat
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'rename_chat',
        description:
          'Update the title of a chat session. Omit thread_id to rename the current session.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'New session title (max 120 chars)',
            },
            thread_id: {
              type: 'string',
              description: 'Thread UUID to rename. Omit to rename the current session.',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },

    // ------------------------------------------------------------------
    // delete_chat
    // ------------------------------------------------------------------
    {
      type: 'function',
      function: {
        name: 'delete_chat',
        description:
          'Permanently delete a chat session and all its messages. This is irreversible — require confirmed:true before calling. Use archive_chat for soft removal.',
        parameters: {
          type: 'object',
          properties: {
            thread_id: {
              type: 'string',
              description: 'Thread UUID to delete.',
            },
            confirmed: {
              type: 'boolean',
              description: 'Must be true after the user explicitly confirms deletion.',
            },
          },
          required: ['thread_id', 'confirmed'],
          additionalProperties: false,
        },
      },
    },
  ],

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  handlers: {
    // ------------------------------------------------------------------
    list_chats: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const rawLimit = args.limit != null ? Number(args.limit) : 20;
      const limit = Math.min(Math.max(1, rawLimit || 20), 100);

      const threads = await pgListChatThreads(userId, { archivedOnly: false });
      if (!threads) return JSON.stringify({ error: 'Failed to list chats' });

      const results = threads.slice(0, limit).map(summarizeThread);
      return JSON.stringify({ ok: true, count: results.length, chats: results });
    },

    // ------------------------------------------------------------------
    list_archived_chats: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const rawLimit = args.limit != null ? Number(args.limit) : 20;
      const limit = Math.min(Math.max(1, rawLimit || 20), 100);

      const threads = await pgListChatThreads(userId, { archivedOnly: true });
      if (!threads) return JSON.stringify({ error: 'Failed to list archived chats' });

      const results = threads.slice(0, limit).map(summarizeThread);
      return JSON.stringify({ ok: true, count: results.length, chats: results });
    },

    // ------------------------------------------------------------------
    get_chat: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const threadId =
        typeof args.thread_id === 'string' && args.thread_id.trim()
          ? args.thread_id.trim()
          : (getCurrentThreadId() ?? '');

      if (!threadId) return JSON.stringify({ error: 'No thread_id provided and no current session' });

      const detail = await pgGetChatThread(userId, threadId);
      if (!detail) return JSON.stringify({ error: `Thread ${threadId} not found` });

      const messages = detail.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content.slice(0, 2000), // truncate to avoid huge payloads
        created_at: m.created_at,
      }));

      return JSON.stringify({
        ok: true,
        thread: summarizeThread(detail),
        message_count: messages.length,
        messages,
      });
    },

    // ------------------------------------------------------------------
    search_chats: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      if (!query) return JSON.stringify({ error: 'query is required' });

      const includeArchived = args.include_archived !== false;

      // Fetch both buckets and filter in JS (small dataset; no need for SQL LIKE)
      const [active, archived] = await Promise.all([
        pgListChatThreads(userId, { archivedOnly: false }),
        includeArchived ? pgListChatThreads(userId, { archivedOnly: true }) : Promise.resolve([]),
      ]);

      const all = [...(active ?? []), ...(archived ?? [])];
      const matched = all
        .filter((t) => t.title.toLowerCase().includes(query))
        .map(summarizeThread);

      return JSON.stringify({ ok: true, query, count: matched.length, chats: matched });
    },

    // ------------------------------------------------------------------
    archive_chat: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const threadId =
        typeof args.thread_id === 'string' && args.thread_id.trim()
          ? args.thread_id.trim()
          : (getCurrentThreadId() ?? '');

      if (!threadId) return JSON.stringify({ error: 'No thread_id provided and no current session' });

      const ok = await pgSetChatArchived(userId, threadId, true);
      if (!ok) return JSON.stringify({ error: `Failed to archive thread ${threadId} — not found or permission denied` });

      return JSON.stringify({ ok: true, archived: true, thread_id: threadId });
    },

    // ------------------------------------------------------------------
    unarchive_chat: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const threadId = typeof args.thread_id === 'string' ? args.thread_id.trim() : '';
      if (!threadId) return JSON.stringify({ error: 'thread_id is required' });

      const ok = await pgSetChatArchived(userId, threadId, false);
      if (!ok) return JSON.stringify({ error: `Failed to unarchive thread ${threadId} — not found or permission denied` });

      return JSON.stringify({ ok: true, archived: false, thread_id: threadId });
    },

    // ------------------------------------------------------------------
    rename_chat: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });
      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const rawTitle = typeof args.title === 'string' ? args.title.trim() : '';
      if (!rawTitle) return JSON.stringify({ error: 'title is required' });
      const title = rawTitle.slice(0, 120);

      const threadId =
        typeof args.thread_id === 'string' && args.thread_id.trim()
          ? args.thread_id.trim()
          : (getCurrentThreadId() ?? '');

      if (!threadId) return JSON.stringify({ error: 'No thread_id provided and no current session' });

      const ok = await pgUpdateChatTitle(threadId, title);
      if (!ok) return JSON.stringify({ error: `Failed to rename thread ${threadId}` });

      return JSON.stringify({ ok: true, thread_id: threadId, title });
    },

    // ------------------------------------------------------------------
    delete_chat: async (args) => {
      if (!isConfigured()) return JSON.stringify({ error: 'DATABASE_URL not configured' });

      if (args.confirmed !== true) {
        return JSON.stringify({
          error: 'Deletion requires confirmed:true — this permanently removes the session and all its messages.',
        });
      }

      const userId = getCurrentUserId();
      if (!userId) return JSON.stringify({ error: 'No authenticated user in context' });

      const threadId = typeof args.thread_id === 'string' ? args.thread_id.trim() : '';
      if (!threadId) return JSON.stringify({ error: 'thread_id is required' });

      const ok = await pgDeleteChatThread(userId, threadId);
      if (!ok) return JSON.stringify({ error: `Failed to delete thread ${threadId} — not found or permission denied` });

      return JSON.stringify({ ok: true, deleted: true, thread_id: threadId });
    },
  },
};
