/**
 * POST /api/email/rules/reorder — persist rule priority order { ids: string[] }
 */

import { createReorderPostHandler } from '../../../../lib/api/reorderHandler';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  emailRulesStorageBackend,
  storeReorderEmailRules,
} from '../../../../lib/emailRuleStore';

export const prerender = false;

export const POST = createReorderPostHandler({
  field: 'ids',
  parse: (raw) => raw.map((id) => String(id ?? '').trim()).filter(Boolean),
  reorder: async (ids) => {
    const result = await storeReorderEmailRules(ids);
    if (!result.ok) return result;
    return { ok: true as const, result: result.rules };
  },
  success: (_context, _auth, rules) =>
    jsonResponse({
      ok: true,
      rules: rules ?? [],
      storage: emailRulesStorageBackend(),
    }),
});
