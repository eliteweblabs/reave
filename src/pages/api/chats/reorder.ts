/**
 * POST /api/chats/reorder — persist manual chat sidebar order { ids: string[] }
 */

import { createReorderPostHandler } from '../../../lib/api/reorderHandler';
import { jsonResponse } from '../../../lib/apiResponse';
import { storeListChatThreadsForOwner } from '../../../lib/chatOwnerAccess';
import { chatStorageBackend } from '../../../lib/chatStore';
import { storeGetSidebarOrder, storeReorderSidebarList, sortBySidebarOrder } from '../../../lib/sidebarOrderStore';

export const prerender = false;

export const POST = createReorderPostHandler({
  field: 'ids',
  parse: (raw) => raw.map((id) => String(id).trim()).filter(Boolean),
  reorder: (ids) => storeReorderSidebarList('chats', ids),
  success: async (_context, { userId }) => {
    const threads = await storeListChatThreadsForOwner(userId);
    const orderMap = await storeGetSidebarOrder('chats');
    const sorted = sortBySidebarOrder(
      threads.threads,
      orderMap,
      (t) => t.id,
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return jsonResponse({ ok: true, threads: sorted, storage: chatStorageBackend() });
  },
});
