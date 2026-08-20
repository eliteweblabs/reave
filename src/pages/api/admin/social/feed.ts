/**
 * GET  /api/admin/social/feed — unified inbox (networks + activity)
 * POST /api/admin/social/feed — save a reply draft / mark responded
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { hasFeature } from '../../../../lib/features';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import {
  buildSocialFeed,
  composeIntentUrl,
  isSocialFeedNetworkId,
} from '../../../../lib/social/feed.ts';
import { upsertActivityReply } from '../../../../lib/social/activityStore.ts';
import { updateOnlineReview } from '../../../../lib/onlineReviewsStore.ts';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('social_inbox')) {
    return json({ ok: false, error: 'social_inbox not enabled' }, 404);
  }

  try {
    const url = new URL(context.request.url);
    const company = await getCompanyConfig(context.request);
    const feed = await buildSocialFeed(company, {
      platform: url.searchParams.get('platform') || undefined,
      search: url.searchParams.get('q') || undefined,
    });
    return json({ ok: true, feed });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load social feed';
    return json({ ok: false, error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('social_inbox')) {
    return json({ ok: false, error: 'social_inbox not enabled' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();

  if (action === 'reply') {
    const id = String(body.id ?? '').trim();
    if (!id) return json({ ok: false, error: 'id required' }, 400);

    const replyDraft = body.replyDraft !== undefined ? String(body.replyDraft ?? '') : undefined;
    const replyText = body.replyText !== undefined ? String(body.replyText ?? '') : undefined;
    const statusRaw = body.status != null ? String(body.status) : undefined;
    const status =
      statusRaw === 'new' || statusRaw === 'todo' || statusRaw === 'responded' || statusRaw === 'dismissed'
        ? statusRaw
        : undefined;

    if (id.startsWith('review:')) {
      const reviewId = id.slice('review:'.length);
      const review = await updateOnlineReview(reviewId, {
        responseDraft: replyDraft,
        responseText: replyText,
        status,
      });
      if (!review) return json({ ok: false, error: 'Review not found' }, 404);
      return json({ ok: true, review });
    }

    const saved = await upsertActivityReply({
      itemId: id,
      replyDraft,
      replyText,
      status,
    });
    return json({ ok: true, reply: saved, persisted: Boolean(saved) });
  }

  if (action === 'compose_urls') {
    const text = String(body.text ?? '').trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : [];
    const profileUrls =
      body.profileUrls && typeof body.profileUrls === 'object'
        ? (body.profileUrls as Record<string, string>)
        : {};
    const urls = platforms
      .filter(isSocialFeedNetworkId)
      .map((platform) => ({
        platform,
        url: composeIntentUrl(platform, text, profileUrls[platform] ?? null),
      }));
    return json({ ok: true, urls, copyText: text });
  }

  return json({ ok: false, error: 'Unknown action' }, 400);
}
