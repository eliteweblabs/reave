/**
 * GET    /api/admin/memories — list durable recall items for the signed-in owner
 * POST   /api/admin/memories — add or update { content, kind?, key?, scope? }
 * DELETE /api/admin/memories — remove { id } or { key }
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  inferMemoryScope,
  isUsableMemoryContent,
  MEMORY_KINDS,
  normalizeMemoryContent,
  normalizeMemoryKey,
  normalizeMemoryKind,
  normalizeMemoryScope,
} from '../../../lib/agentMemory';
import {
  storeDeleteMemory,
  storeListMemories,
  storeUpsertMemory,
} from '../../../lib/agentMemoryStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  const kindRaw = context.url.searchParams.get('kind')?.trim();
  const query = context.url.searchParams.get('q')?.trim() || undefined;
  const kind = kindRaw ? normalizeMemoryKind(kindRaw) : undefined;
  const memories = await storeListMemories({ userId, kind, query, limit: 80 });
  return jsonResponse({ ok: true, count: memories.length, memories, kinds: MEMORY_KINDS });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }
  const content = normalizeMemoryContent(body.content);
  if (!isUsableMemoryContent(content)) {
    return jsonResponse({ ok: false, error: 'content is required and must not look like a secret' }, 400);
  }
  const kind = normalizeMemoryKind(body.kind);
  const scope = body.scope
    ? normalizeMemoryScope(body.scope, kind)
    : inferMemoryScope(kind, content);
  const result = await storeUpsertMemory({
    userId,
    scope,
    kind,
    key: normalizeMemoryKey(body.key, `${kind}.${content}`),
    content,
    source: 'owner',
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 500);
  return jsonResponse({ ok: true, created: result.created, memory: result.memory });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  let id = Number(context.url.searchParams.get('id') ?? '');
  let key = context.url.searchParams.get('key')?.trim() || undefined;
  if (!Number.isFinite(id) || id <= 0) {
    try {
      const body = (await context.request.json()) as Record<string, unknown>;
      if (body.id != null) id = Number(body.id);
      if (typeof body.key === 'string') key = body.key.trim();
    } catch {
      /* query-string only */
    }
  }
  const result = await storeDeleteMemory({
    userId,
    id: Number.isFinite(id) && id > 0 ? id : undefined,
    key,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, deleted: result.deleted });
}
