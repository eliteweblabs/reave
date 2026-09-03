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
import { updateSocialLeadScannerHit } from '../../../../lib/socialLeadScannerStore.ts';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('social_inbox')) {
    return jsonResponse({ ok: false, error: 'social_inbox not enabled' }, 404);
  }

  try {
    const url = new URL(context.request.url);
    const company = await getCompanyConfig(context.request);
    const feed = await buildSocialFeed(company, {
      platform: url.searchParams.get('platform') || undefined,
      search: url.searchParams.get('q') || undefined,
    });
    return jsonResponse({ ok: true, feed });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load social feed';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('social_inbox')) {
    return jsonResponse({ ok: false, error: 'social_inbox not enabled' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();

  if (action === 'reply') {
    const id = String(body.id ?? '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'id required' }, 400);

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
      if (!review) return jsonResponse({ ok: false, error: 'Review not found' }, 404);
      return jsonResponse({ ok: true, review });
    }

    if (id.startsWith('lead:')) {
      const hitId = id.slice('lead:'.length);
      const hit = await updateSocialLeadScannerHit(hitId, {
        replyDraft,
        status,
      });
      if (!hit) return jsonResponse({ ok: false, error: 'Lead not found' }, 404);
      return jsonResponse({ ok: true, hit });
    }

    const saved = await upsertActivityReply({
      itemId: id,
      replyDraft,
      replyText,
      status,
    });
    return jsonResponse({ ok: true, reply: saved, persisted: Boolean(saved) });
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
    return jsonResponse({ ok: true, urls, copyText: text });
  }

  return jsonResponse({ ok: false, error: 'Unknown action' }, 400);
}
