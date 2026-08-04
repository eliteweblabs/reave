/**
 * Sync online reviews from external APIs (Google Places today; manual for others).
 */
import { getGoogleMapsApiKey } from './googleMapsApiKey';
import {
  getOnlineReviewsConfig,
  recordSyncResult,
  upsertOnlineReview,
  type ReviewPlatform,
} from './onlineReviewsStore';

type GoogleReview = {
  name?: string;
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; uri?: string };
  publishTime?: string;
};

type GooglePlaceResponse = {
  reviews?: GoogleReview[];
};

export function isGooglePlacesConfigured(): boolean {
  return !!getGoogleMapsApiKey();
}

/** Extract Place ID from a Google Maps / Business profile URL when possible. */
export function extractGooglePlaceId(raw: string | null | undefined): string | null {
  const url = String(raw ?? '').trim();
  if (!url) return null;

  // ChIJ… format in URL path or query
  const chij = url.match(/(ChI[A-Za-z0-9_-]{20,})/);
  if (chij) return chij[1];

  // place_id query param
  const placeIdParam = url.match(/[?&]place_id=([^&]+)/i);
  if (placeIdParam) return decodeURIComponent(placeIdParam[1]);

  // Raw place id pasted directly
  if (/^ChI[A-Za-z0-9_-]{20,}$/.test(url)) return url;

  return null;
}

async function fetchGoogleReviews(placeId: string): Promise<GoogleReview[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY not configured');

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'reviews',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Places API ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as GooglePlaceResponse;
  return Array.isArray(data.reviews) ? data.reviews : [];
}

export type SyncResult = {
  platform: ReviewPlatform;
  fetched: number;
  upserted: number;
  errors: string[];
};

export async function syncGoogleReviews(options?: {
  placeId?: string | null;
}): Promise<SyncResult> {
  const result: SyncResult = { platform: 'google', fetched: 0, upserted: 0, errors: [] };

  if (!isGooglePlacesConfigured()) {
    result.errors.push('Set GOOGLE_MAPS_API_KEY (or GOOGLE_PLACES_API_KEY) to sync Google reviews.');
    await recordSyncResult(result.errors.join(' '));
    return result;
  }

  const config = await getOnlineReviewsConfig();
  const placeId =
    options?.placeId?.trim() ||
    config.googlePlaceId?.trim() ||
    null;

  if (!placeId) {
    result.errors.push('Configure a Google Place ID in Reviews settings.');
    await recordSyncResult(result.errors.join(' '));
    return result;
  }

  try {
    const reviews = await fetchGoogleReviews(placeId);
    result.fetched = reviews.length;

    for (const review of reviews) {
      const externalId = review.name?.trim() || null;
      const text = review.text?.text || review.originalText?.text || null;
      const authorName = review.authorAttribution?.displayName ?? null;
      const reviewUrl = review.authorAttribution?.uri ?? null;
      const reviewedAt = review.publishTime ?? null;

      await upsertOnlineReview({
        platform: 'google',
        externalId,
        authorName,
        rating: review.rating ?? null,
        reviewText: text,
        reviewUrl,
        reviewedAt,
      });
      result.upserted += 1;
    }

    await recordSyncResult(null);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Google sync failed';
    result.errors.push(message);
    await recordSyncResult(message);
  }

  return result;
}
