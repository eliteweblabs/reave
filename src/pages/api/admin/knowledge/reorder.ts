/**
 * POST /api/admin/knowledge/reorder — persist manual knowledge sidebar order { slugs: string[] }
 */

import { createReorderPostHandler } from '../../../../lib/api/reorderHandler';
import { jsonResponse } from '../../../../lib/apiResponse';
import { storeListKnowledge } from '../../../../lib/knowledgeStore';
import { storeGetSidebarOrder, storeReorderSidebarList, sortBySidebarOrder } from '../../../../lib/sidebarOrderStore';

export const prerender = false;

export const POST = createReorderPostHandler({
  field: 'slugs',
  altField: 'ids',
  parse: (raw) => raw.map((s) => String(s).trim()).filter(Boolean),
  reorder: (slugs) => storeReorderSidebarList('knowledge', slugs),
  success: async () => {
    const entries = await storeListKnowledge();
    const orderMap = await storeGetSidebarOrder('knowledge');
    const sorted = sortBySidebarOrder(
      entries,
      orderMap,
      (e) => e.slug,
      (a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      },
    );
    return jsonResponse({ ok: true, entries: sorted });
  },
});
