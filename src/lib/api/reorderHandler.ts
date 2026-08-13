import type { APIContext } from 'astro';
import { jsonResponse, readJsonBody } from '../apiResponse';
import { requireDashboardUser } from '../dashboardAuth';

type ReorderRouteOptions<T extends string | number, R = void> = {
  /** Body field name in error messages (e.g. "slugs", "ids"). */
  field: string;
  /** Accept `body.ids` as a fallback key (work/knowledge routes). */
  altField?: string;
  parse: (raw: unknown[]) => T[];
  reorder: (items: T[]) => Promise<{ ok: true; result?: R } | { ok: false; error: string }>;
  success: (
    context: APIContext,
    auth: { userId: string },
    reorderResult?: R,
  ) => Promise<Response> | Response;
  beforeReorder?: (context: APIContext, auth: { userId: string }) => Response | null;
};

export function createReorderPostHandler<T extends string | number, R = void>(
  opts: ReorderRouteOptions<T, R>,
) {
  return async function POST(context: APIContext): Promise<Response> {
    const auth = await requireDashboardUser(context);
    if (auth instanceof Response) return auth;

    if (opts.beforeReorder) {
      const blocked = opts.beforeReorder(context, auth);
      if (blocked) return blocked;
    }

    const parsed = await readJsonBody(context.request);
    if (parsed instanceof Response) return parsed;
    const { body } = parsed;

    const raw = body[opts.field] ?? (opts.altField ? body[opts.altField] : undefined);
    if (!Array.isArray(raw)) {
      return jsonResponse({ ok: false, error: `${opts.field} array required` }, 400);
    }

    const items = opts.parse(raw);
    if (items.length === 0) {
      return jsonResponse({ ok: false, error: `${opts.field} array required` }, 400);
    }

    const result = await opts.reorder(items);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);

    return opts.success(context, auth, result.result);
  };
}
