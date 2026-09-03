/**
 * Google reviews for config-driven landing pages (vet, service, etc.).
 */
import { searchPlaceDetails } from './googlePlaceDetails';
import { getGoogleMapsApiKey } from './googleMapsApiKey';
import { extractGooglePlaceId } from './onlineReviewsSync';
import type { SiteLandingReview } from './siteContent';

export type SiteLandingReviewsConfig = {
  heading: string;
  intro?: string;
  items?: SiteLandingReview[];
  googleMapsUrl?: string;
  googlePlaceId?: string;
  googlePlaceQuery?: string;
};

type GoogleReview = {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string };
};

function starsForRating(rating: number | undefined): string {
  const n = Math.round(Number(rating) || 0);
  if (n <= 0) return '';
  return '★'.repeat(Math.max(1, Math.min(5, n)));
}

async function fetchGoogleReviews(placeId: string): Promise<GoogleReview[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  const id = placeId.replace(/^places\//, '').trim();
  if (!id) return [];

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'reviews',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { reviews?: GoogleReview[] };
    return Array.isArray(data.reviews) ? data.reviews : [];
  } catch {
    return [];
  }
}

async function resolvePlaceId(config: SiteLandingReviewsConfig): Promise<string | null> {
  const explicit = config.googlePlaceId?.trim();
  if (explicit) return explicit.replace(/^places\//, '');

  const mapsUrl = config.googleMapsUrl?.trim();
  if (mapsUrl) {
    const direct = extractGooglePlaceId(mapsUrl);
    if (direct) return direct;
    try {
      const res = await fetch(mapsUrl, { redirect: 'follow' });
      const fromRedirect = extractGooglePlaceId(res.url);
      if (fromRedirect) return fromRedirect;
    } catch {
      /* fall through to text search */
    }
  }

  const query = config.googlePlaceQuery?.trim();
  if (!query) return null;

  const details = await searchPlaceDetails(query, { near: 'Western Massachusetts' });
  return details?.placeId ?? null;
}

function mapGoogleReview(review: GoogleReview): SiteLandingReview | null {
  const quote = (review.text?.text || review.originalText?.text || '').trim();
  if (!quote) return null;
  const author = review.authorAttribution?.displayName?.trim() || 'Google reviewer';
  return {
    quote,
    cite: author,
    stars: starsForRating(review.rating),
  };
}

/** Static config items win; otherwise pull live from Google Places when configured. */
export async function loadSiteLandingReviews(
  config: SiteLandingReviewsConfig | undefined,
): Promise<{ heading: string; intro?: string; items: SiteLandingReview[]; mapsUrl?: string } | null> {
  if (!config?.heading) return null;

  if (config.items?.length) {
    return {
      heading: config.heading,
      intro: config.intro,
      items: config.items,
      mapsUrl: config.googleMapsUrl,
    };
  }

  const placeId = await resolvePlaceId(config);
  if (!placeId) {
    return config.googleMapsUrl
      ? { heading: config.heading, intro: config.intro, items: [], mapsUrl: config.googleMapsUrl }
      : null;
  }

  const raw = await fetchGoogleReviews(placeId);
  const items = raw.map(mapGoogleReview).filter((item): item is SiteLandingReview => item !== null);

  return {
    heading: config.heading,
    intro: config.intro,
    items,
    mapsUrl: config.googleMapsUrl,
  };
}
