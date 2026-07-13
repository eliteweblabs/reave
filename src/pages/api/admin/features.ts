/**
 * GET  /api/admin/features — list plugins and enabled state
 * PUT  /api/admin/features — replace enabled plugin set
 */
import type { APIContext } from 'astro';
import {
  CORE_FEATURE_NOTE,
  FEATURE_GROUPS,
  FEATURE_IDS,
  FEATURE_LABELS,
  setEnabledFeatures,
  type FeatureId,
} from '../../../lib/features';
import { featureStorageBackend, getStoredFeatures, setStoredFeatures } from '../../../lib/featureStore';
import { listEnabledHelperCommands } from '../../../lib/agentHelperCommands.server';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function requireUser(context: APIContext): string | Response {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  return userId;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = requireUser(context);
  if (auth instanceof Response) return auth;

  const stored = await getStoredFeatures();
  const enabled = new Set(stored ?? []);

  const modules = FEATURE_IDS.map((id) => ({
    id,
    label: FEATURE_LABELS[id],
    enabled: enabled.has(id),
  }));

  return json({
    ok: true,
    backend: featureStorageBackend(),
    coreNote: CORE_FEATURE_NOTE,
    groups: FEATURE_GROUPS.map((g) => ({
      ...g,
      modules: g.features.map((id) => ({
        id,
        label: FEATURE_LABELS[id],
        enabled: enabled.has(id),
      })),
    })),
    modules,
    enabled: [...enabled],
    slashCommandCount: listEnabledHelperCommands().length,
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = requireUser(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const enabledRaw = (body as { enabled?: unknown })?.enabled;
  if (!Array.isArray(enabledRaw)) {
    return json({ ok: false, error: 'enabled must be an array of feature ids' }, 400);
  }

  const allowed = new Set<string>(FEATURE_IDS);
  const enabled: FeatureId[] = [];
  for (const item of enabledRaw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (allowed.has(id)) enabled.push(id as FeatureId);
  }

  const ok = await setStoredFeatures(enabled);
  if (!ok) return json({ ok: false, error: 'Failed to save features' }, 500);

  setEnabledFeatures(enabled);

  return json({
    ok: true,
    backend: featureStorageBackend(),
    enabled,
    slashCommandCount: listEnabledHelperCommands().length,
  });
}
