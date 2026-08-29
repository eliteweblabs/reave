/**
 * GET  /api/admin/online-reviews — list reviews + config + summary
 * POST /api/admin/online-reviews — create, update, sync, save config
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { hasFeature } from '../../../lib/features';
import { getCompanyConfig } from '../../../lib/companyConfig';
import {
  createManualReview,
  deleteOnlineReview,
  getOnlineReview,
  getOnlineReviewsConfig,
  listOnlineReviews,
  normalizeReviewPlatform,
  normalizeReviewStatus,
  onlineReviewsSummary,
  saveOnlineReviewsConfig,
  updateOnlineReview,
  REVIEW_PLATFORMS,
  REVIEW_STATUSES,
} from '../../../lib/onlineReviewsStore';
import {
  extractGooglePlaceId,
  isGooglePlacesConfigured,
  syncGoogleReviews,
} from '../../../lib/onlineReviewsSync';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function featureGate(): Response | null {
  if (!hasFeature('online_reviews')) {
    return jsonResponse({ error: 'online_reviews not enabled' }, 404);
  }
  return null;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const blocked = featureGate();
  if (blocked) return blocked;

  const statusParam = context.url.searchParams.get('status')?.trim() || 'inbox';
  const reviewId = context.url.searchParams.get('id')?.trim() || null;

  const [config, summary, company] = await Promise.all([
    getOnlineReviewsConfig(),
    onlineReviewsSummary(),
    getCompanyConfig(context.request),
  ]);

  const suggestedPlaceId =
    config.googlePlaceId ||
    extractGooglePlaceId(company.socialGoogleBusiness) ||
    null;

  if (reviewId) {
    const review = await getOnlineReview(reviewId);
    if (!review) return jsonResponse({ error: 'Review not found' }, 404);
    return jsonResponse({ ok: true, review, config, summary, suggestedPlaceId });
  }

  const filterStatus =
    statusParam === 'all'
      ? undefined
      : statusParam === 'inbox'
        ? ('inbox' as const)
        : normalizeReviewStatus(statusParam);

  const reviews = await listOnlineReviews({
    status: filterStatus ?? (statusParam === 'all' ? undefined : 'inbox'),
    limit: 200,
  });

  return jsonResponse({
    ok: true,
    reviews,
    config,
    summary,
    suggestedPlaceId,
    googlePlacesConfigured: isGooglePlacesConfigured(),
    platforms: REVIEW_PLATFORMS,
    statuses: REVIEW_STATUSES,
    companyReviewLinks: {
      google: company.socialGoogleBusiness ?? null,
      yelp: company.socialYelp ?? null,
      facebook: company.socialFacebook ?? null,
    },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const blocked = featureGate();
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();

  if (action === 'save_config') {
    const config = await saveOnlineReviewsConfig({
      googlePlaceId:
        body.googlePlaceId !== undefined ? String(body.googlePlaceId ?? '') : undefined,
      syncEnabled: body.syncEnabled !== undefined ? !!body.syncEnabled : undefined,
    });
    return jsonResponse({ ok: true, config });
  }

  if (action === 'sync') {
    const placeId =
      body.googlePlaceId !== undefined
        ? String(body.googlePlaceId ?? '').trim() || null
        : undefined;
    const syncResult = await syncGoogleReviews({ placeId });
    const [reviews, summary, config] = await Promise.all([
      listOnlineReviews({ status: 'inbox' }),
      onlineReviewsSummary(),
      getOnlineReviewsConfig(),
    ]);
    return jsonResponse({ ok: true, syncResult, reviews, summary, config });
  }

  if (action === 'create') {
    const platform = normalizeReviewPlatform(body.platform);
    if (!platform) return jsonResponse({ error: 'Invalid platform' }, 400);

    const review = await createManualReview({
      platform,
      authorName: body.authorName != null ? String(body.authorName) : null,
      rating: body.rating != null ? Number(body.rating) : null,
      reviewText: body.reviewText != null ? String(body.reviewText) : null,
      reviewUrl: body.reviewUrl != null ? String(body.reviewUrl) : null,
      reviewedAt: body.reviewedAt != null ? String(body.reviewedAt) : null,
    });

    const summary = await onlineReviewsSummary();
    return jsonResponse({ ok: true, review, summary });
  }

  if (action === 'update') {
    const id = String(body.id ?? '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);

    const status = body.status !== undefined ? normalizeReviewStatus(body.status) : undefined;
    if (body.status !== undefined && !status) return jsonResponse({ error: 'Invalid status' }, 400);

    const review = await updateOnlineReview(id, {
      status,
      responseDraft: body.responseDraft !== undefined ? String(body.responseDraft ?? '') : undefined,
      responseText: body.responseText !== undefined ? String(body.responseText ?? '') : undefined,
      notes: body.notes !== undefined ? String(body.notes ?? '') : undefined,
    });

    if (!review) return jsonResponse({ error: 'Review not found' }, 404);

    const summary = await onlineReviewsSummary();
    return jsonResponse({ ok: true, review, summary });
  }

  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    const deleted = await deleteOnlineReview(id);
    if (!deleted) return jsonResponse({ error: 'Review not found' }, 404);
    const summary = await onlineReviewsSummary();
    return jsonResponse({ ok: true, summary });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}
