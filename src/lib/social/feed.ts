/**
 * Unified social inbox — activity from the company's chosen networks,
 * plus Google / Yelp (and other) reviews when that module is on.
 *
 * Live adapters are not wired yet. Configured profile links get a
 * deterministic sample feed so the inbox is usable; Google Places reviews
 * are real when sync has run. Reply/post still opens the network (or a
 * draft in Reave) until write scopes land.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import { hasFeature } from '../features.ts';
import {
  listOnlineReviews,
  type OnlineReview,
  type ReviewPlatform,
} from '../onlineReviewsStore.ts';
import { accountsFromCompany } from './accounts.ts';
import { getActivityReplies, type SocialActivityReply } from './activityStore.ts';
import {
  DEFAULT_VISIBLE_SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_CATALOG,
  parseHiddenSocialPlatforms,
  visibleSocialPlatforms,
  type SocialPlatformDef,
} from './platforms.ts';
import type { SocialAccount, SocialPlatformId } from './types.ts';

export type SocialFeedNetworkId = SocialPlatformId | 'apple' | 'tripadvisor' | 'other';

export type SocialFeedItemKind = 'post' | 'comment' | 'mention' | 'review';

export type SocialFeedItemStatus = 'new' | 'todo' | 'responded' | 'dismissed';

export interface SocialFeedNetwork {
  id: SocialFeedNetworkId;
  label: string;
  iconSlug: string;
  color: string;
  handle: string | null;
  url: string | null;
  configured: boolean;
}

export interface SocialFeedItem {
  id: string;
  platform: SocialFeedNetworkId;
  platformLabel: string;
  kind: SocialFeedItemKind;
  authorName: string;
  text: string;
  url: string | null;
  createdAt: string;
  rating: number | null;
  status: SocialFeedItemStatus;
  replyDraft: string;
  replyText: string;
  live: boolean;
  source: 'review' | 'social';
  reviewId: string | null;
  canReply: boolean;
}

export interface SocialFeedPayload {
  generatedAt: string;
  live: boolean;
  reviewsEnabled: boolean;
  networks: SocialFeedNetwork[];
  items: SocialFeedItem[];
  counts: Record<string, number>;
  composeHint: string;
}

const REVIEW_ONLY_META: Record<
  Exclude<SocialFeedNetworkId, SocialPlatformId>,
  { label: string; iconSlug: string; color: string }
> = {
  apple: { label: 'Apple Maps', iconSlug: 'apple', color: '#555555' },
  tripadvisor: { label: 'Tripadvisor', iconSlug: 'tripadvisor', color: '#34e0a1' },
  other: { label: 'Other', iconSlug: 'star', color: '#64748b' },
};

const INBOX_CORE: SocialPlatformId[] = [
  'twitter',
  'instagram',
  'linkedin',
  'facebook',
  'youtube',
  'tiktok',
  'threads',
  'yelp',
  'googlebusiness',
];

const REVIEW_TO_FEED: Record<ReviewPlatform, SocialFeedNetworkId> = {
  google: 'googlebusiness',
  apple: 'apple',
  yelp: 'yelp',
  facebook: 'facebook',
  tripadvisor: 'tripadvisor',
  other: 'other',
};

const SAMPLE_INBOUND = [
  { kind: 'comment' as const, author: 'Maya Chen', text: 'Loved this — when can we book again?' },
  { kind: 'mention' as const, author: 'Jordan Hale', text: 'Just tagged you — can someone from the team take a look?' },
  { kind: 'comment' as const, author: 'Priya Nair', text: 'Are you open Saturday morning? Need a quote.' },
  { kind: 'comment' as const, author: 'Chris Alvarez', text: 'This is exactly what we needed. Thank you!' },
  { kind: 'mention' as const, author: 'Sam Ortiz', text: 'Anyone tried these folks? Thinking of reaching out.' },
];

const SAMPLE_POSTS = [
  'Behind the scenes from this week’s jobs — thank you for having us.',
  'New availability just opened. Message us or book from the site.',
  'A quick thank-you to everyone who left a review this month.',
];

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function catalogById(id: SocialPlatformId): SocialPlatformDef | undefined {
  return SOCIAL_PLATFORM_CATALOG.find((p) => p.id === id);
}

function networkMeta(id: SocialFeedNetworkId): { label: string; iconSlug: string; color: string } {
  if (id in REVIEW_ONLY_META) return REVIEW_ONLY_META[id as keyof typeof REVIEW_ONLY_META];
  const cat = catalogById(id as SocialPlatformId);
  return {
    label: cat?.label ?? id,
    iconSlug: cat?.iconSlug ?? id,
    color: cat?.color ?? '#64748b',
  };
}

function itemPermalink(account: SocialAccount, kind: SocialFeedItemKind, token: string): string {
  const base = account.url.replace(/\/+$/, '');
  switch (account.platform) {
    case 'twitter':
      return `${base}/status/${token}`;
    case 'instagram':
    case 'threads':
      return `${base}/p/${token}`;
    case 'facebook':
      return `${base}/posts/${token}`;
    case 'linkedin':
      return `${base}/posts/${token}`;
    case 'youtube':
      return `https://youtube.com/watch?v=${token}`;
    case 'tiktok':
      return `${base}/video/${token}`;
    case 'yelp':
      return `${base}?hrid=${token}`;
    case 'googlebusiness':
      return base;
    default:
      return kind === 'review' ? base : `${base}#${token}`;
  }
}

function applyReply(
  item: SocialFeedItem,
  replies: Map<string, SocialActivityReply>,
): SocialFeedItem {
  const saved = replies.get(item.id);
  if (!saved) return item;
  return {
    ...item,
    replyDraft: saved.replyDraft,
    replyText: saved.replyText,
    status: saved.status,
  };
}

function sampleItemsForAccount(account: SocialAccount): SocialFeedItem[] {
  const seed = hashString(`${account.platform}:${account.handle.toLowerCase()}`);
  const rng = makeRng(seed);
  const items: SocialFeedItem[] = [];
  const inboundCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < inboundCount; i++) {
    const sample = SAMPLE_INBOUND[Math.floor(rng() * SAMPLE_INBOUND.length)];
    const token = (seed + i * 97).toString(36);
    items.push({
      id: `soc:${account.platform}:${account.handle}:${i}`,
      platform: account.platform,
      platformLabel: account.label,
      kind: sample.kind,
      authorName: sample.author,
      text: sample.text,
      url: itemPermalink(account, sample.kind, token),
      createdAt: isoHoursAgo(4 + i * 18 + Math.floor(rng() * 8)),
      rating: null,
      status: 'new',
      replyDraft: '',
      replyText: '',
      live: false,
      source: 'social',
      reviewId: null,
      canReply: true,
    });
  }
  const post = SAMPLE_POSTS[Math.floor(rng() * SAMPLE_POSTS.length)];
  items.push({
    id: `soc:${account.platform}:${account.handle}:post`,
    platform: account.platform,
    platformLabel: account.label,
    kind: 'post',
    authorName: account.handle,
    text: post,
    url: itemPermalink(account, 'post', (seed + 3).toString(36)),
    createdAt: isoHoursAgo(10 + Math.floor(rng() * 40)),
    rating: null,
    status: 'new',
    replyDraft: '',
    replyText: '',
    live: false,
    source: 'social',
    reviewId: null,
    canReply: true,
  });
  return items;
}

function reviewToItem(review: OnlineReview): SocialFeedItem {
  const platform = REVIEW_TO_FEED[review.platform];
  const meta = networkMeta(platform);
  return {
    id: `review:${review.id}`,
    platform,
    platformLabel: meta.label,
    kind: 'review',
    authorName: review.authorName || 'Anonymous',
    text: review.reviewText || '(No review text)',
    url: review.reviewUrl,
    createdAt: review.reviewedAt || review.fetchedAt,
    rating: review.rating,
    status: review.status,
    replyDraft: review.responseDraft || '',
    replyText: review.responseText || '',
    live: true,
    source: 'review',
    reviewId: review.id,
    canReply: true,
  };
}

function accountMap(accounts: SocialAccount[]): Map<SocialPlatformId, SocialAccount> {
  return new Map(accounts.map((a) => [a.platform, a]));
}

function chosenNetworks(
  company: CompanyConfig,
  accounts: SocialAccount[],
  items: SocialFeedItem[],
  reviewsEnabled: boolean,
): SocialFeedNetwork[] {
  const byAccount = accountMap(accounts);
  const hidden = parseHiddenSocialPlatforms(company.socialHiddenPlatforms);
  const visible = visibleSocialPlatforms(hidden);
  const visibleIds = new Set(visible.map((p) => p.id));
  const itemPlatforms = new Set(items.map((i) => i.platform));

  const out: SocialFeedNetwork[] = [];
  const seen = new Set<SocialFeedNetworkId>();

  const push = (id: SocialFeedNetworkId) => {
    if (seen.has(id)) return;
    seen.add(id);
    const account = id in REVIEW_ONLY_META ? undefined : byAccount.get(id as SocialPlatformId);
    const meta = networkMeta(id);
    out.push({
      id,
      label: meta.label,
      iconSlug: meta.iconSlug,
      color: meta.color,
      handle: account?.handle ?? null,
      url: account?.url ?? null,
      configured: Boolean(account),
    });
  };

  for (const id of INBOX_CORE) {
    const isReviewDest = id === 'yelp' || id === 'googlebusiness';
    if (visibleIds.has(id) && (byAccount.has(id) || isReviewDest && reviewsEnabled || DEFAULT_VISIBLE_SOCIAL_PLATFORMS.includes(id))) {
      if (byAccount.has(id) || isReviewDest || visibleIds.has(id)) push(id);
    }
  }

  for (const account of accounts) {
    push(account.platform);
  }

  for (const extra of ['apple', 'tripadvisor', 'other'] as const) {
    if (itemPlatforms.has(extra)) push(extra);
  }

  if (!out.length) {
    for (const id of ['instagram', 'facebook', 'linkedin', 'googlebusiness', 'yelp'] as SocialPlatformId[]) {
      push(id);
    }
  }

  return out;
}

export function composeIntentUrl(
  platform: SocialFeedNetworkId,
  text: string,
  profileUrl?: string | null,
): string {
  const encoded = encodeURIComponent(text);
  const profile = (profileUrl || '').trim();
  switch (platform) {
    case 'twitter':
      return `https://twitter.com/intent/tweet?text=${encoded}`;
    case 'linkedin':
      return 'https://www.linkedin.com/feed/?shareActive=true';
    case 'facebook':
      return profile || 'https://www.facebook.com/';
    case 'instagram':
      return profile || 'https://www.instagram.com/';
    case 'threads':
      return profile || 'https://www.threads.net/';
    case 'youtube':
      return 'https://studio.youtube.com/';
    case 'tiktok':
      return 'https://www.tiktok.com/tiktokstudio';
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${encoded}`;
    case 'googlebusiness':
      return 'https://business.google.com/reviews';
    case 'yelp':
      return profile || 'https://biz.yelp.com/';
    default:
      return profile || 'https://';
  }
}

export function isSocialFeedNetworkId(value: string): value is SocialFeedNetworkId {
  if (value in REVIEW_ONLY_META) return true;
  return SOCIAL_PLATFORM_CATALOG.some((p) => p.id === value);
}

export async function buildSocialFeed(
  company: CompanyConfig,
  options: { platform?: string; search?: string } = {},
): Promise<SocialFeedPayload> {
  const reviewsEnabled = hasFeature('online_reviews');
  const accounts = accountsFromCompany(company);
  const replies = await getActivityReplies();

  const socialItems = accounts.flatMap(sampleItemsForAccount).map((item) => applyReply(item, replies));

  let reviewItems: SocialFeedItem[] = [];
  if (reviewsEnabled) {
    try {
      const reviews = await listOnlineReviews({ limit: 200 });
      reviewItems = reviews.map(reviewToItem);
    } catch {
      reviewItems = [];
    }
  }

  const allItems = [...reviewItems, ...socialItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const networks = chosenNetworks(company, accounts, allItems, reviewsEnabled);

  const platformFilter = options.platform && options.platform !== 'all' ? options.platform : null;
  const search = (options.search || '').trim().toLowerCase();

  const items = allItems.filter((item) => {
    if (platformFilter && item.platform !== platformFilter) return false;
    if (!search) return true;
    return (
      item.authorName.toLowerCase().includes(search) ||
      item.text.toLowerCase().includes(search) ||
      item.platformLabel.toLowerCase().includes(search) ||
      item.kind.toLowerCase().includes(search)
    );
  });

  const counts: Record<string, number> = { all: allItems.length };
  for (const network of networks) {
    counts[network.id] = allItems.filter((item) => item.platform === network.id).length;
  }

  return {
    generatedAt: new Date().toISOString(),
    live: reviewItems.length > 0 && reviewItems.some((i) => i.live),
    reviewsEnabled,
    networks,
    items,
    counts,
    composeHint:
      'In-app publish is not live yet — copy your post and open the network, or reply from the item. Google reviews sync into this same inbox.',
  };
}
