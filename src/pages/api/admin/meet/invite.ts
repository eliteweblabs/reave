/**
 * POST /api/admin/meet/invite — Galene stateful guest link (auto-login ?token=).
 */
import type { APIContext } from 'astro';
import { readJsonBody, jsonResponse } from '../../../../lib/apiResponse';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { galeneCreateInvite, isGaleneConfigured } from '../../../../lib/galeneClient';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;

function normalizeGroup(raw: unknown): string {
  const slug = String(raw ?? 'meet')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'meet';
}

function normalizeExpiresDays(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(90, Math.max(1, Math.round(n)));
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('video_meet')) {
    return jsonResponse({ ok: false, error: 'video_meet is not enabled on this install' }, 404);
  }
  if (!isGaleneConfigured()) {
    return jsonResponse({ ok: false, error: 'Galene is not configured (GALENE_API_* env)' }, 503);
  }

  const parsed = await readJsonBody(context.request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const group = normalizeGroup(body.group);
  const username = body.username != null ? String(body.username).trim() : undefined;
  const expiresInDays = normalizeExpiresDays(body.expires_in_days);

  const result = await galeneCreateInvite({
    group,
    username: username || undefined,
    expiresInDays,
  });
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  }

  return jsonResponse({
    ok: true,
    invite: result.data,
  });
}
