/**
 * POST /api/work/reorder — persist manual project sidebar order { slugs: string[] }
 */

import { createReorderPostHandler } from '../../../lib/api/reorderHandler';
import { jsonResponse } from '../../../lib/apiResponse';
import { sortWorkJobsForSidebar, storeListWork } from '../../../lib/workStore';
import { storeReorderSidebarList } from '../../../lib/sidebarOrderStore';

export const prerender = false;

export const POST = createReorderPostHandler({
  field: 'slugs',
  altField: 'ids',
  parse: (raw) => raw.map((s) => String(s).trim()).filter(Boolean),
  reorder: (slugs) => storeReorderSidebarList('work', slugs),
  success: async () => {
    const jobs = await storeListWork();
    const sorted = sortWorkJobsForSidebar(jobs);
    return jsonResponse({ ok: true, jobs: sorted });
  },
});
