/**
 * GET /api/admin/social — social media dashboard metrics for the company's
 * configured handles (from admin → Socials). Uses the active social provider
 * (mock today; real APIs swap in via getSocialProvider()).
 *
 * Query params:
 *   range=7|30|90  reporting window in days (default 30)
 *   tags=foo,bar   optional hashtags to track (overrides name-derived defaults)
 */
import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { buildSocialDashboard } from '../../../lib/social/index.ts';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseRange(raw: string | null): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

function parseTags(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const tags = raw
    .split(',')
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  try {
    const url = new URL(context.request.url);
    const rangeDays = parseRange(url.searchParams.get('range'));
    const hashtags = parseTags(url.searchParams.get('tags'));

    const company = await getCompanyConfig(context.request);
    const dashboard = await buildSocialDashboard(company, { rangeDays, hashtags });

    return json({ ok: true, dashboard });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to build social dashboard';
    return json({ ok: false, error: message }, 500);
  }
}
