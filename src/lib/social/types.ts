/**
 * Social media dashboard — shared types.
 *
 * The dashboard is provider-agnostic: a `SocialProvider` turns a list of
 * configured accounts (parsed from company social links) into per-platform
 * metrics. Today the only provider is the deterministic mock; swapping in a
 * real API (X, Instagram Graph, LinkedIn, …) is a matter of implementing this
 * same interface and wiring it into `getSocialProvider()`.
 */

export type SocialPlatformId =
  | 'twitter'
  | 'instagram'
  | 'linkedin'
  | 'facebook'
  | 'youtube'
  | 'tiktok';

export interface SocialAccount {
  platform: SocialPlatformId;
  /** Display label, e.g. "X / Twitter". */
  label: string;
  /** Bare handle without the leading @, e.g. "reaveapp". */
  handle: string;
  /** Canonical public profile URL. */
  url: string;
  /** Noun for the follower count ("Followers", "Subscribers"). */
  followersLabel: string;
}

export interface SeriesPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number;
}

export interface MetricDelta {
  absolute: number;
  /** Signed percentage change, e.g. 3.2 means +3.2%. */
  percent: number;
}

export interface PlatformMetrics {
  platform: SocialPlatformId;
  label: string;
  handle: string;
  url: string;
  followers: number;
  followersLabel: string;
  /** Daily follower counts over the reporting window. */
  followerSeries: SeriesPoint[];
  change: {
    week: MetricDelta;
    month: MetricDelta;
  };
  /** Posts published within the reporting window. */
  posts: number;
  /** Times the account was @-mentioned within the window. */
  mentions: number;
  /** Total reactions (likes + comments + shares) within the window. */
  reactions: number;
  /** Reactions per follower, as a percentage. */
  engagementRate: number;
}

export interface HashtagMetric {
  tag: string;
  mentions: number;
  reach: number;
  /** Week-over-week change in mentions. */
  change: MetricDelta;
}

export interface SocialDashboard {
  generatedAt: string;
  /** Provider id, e.g. "mock". */
  provider: string;
  /** True once real platform data is wired up. */
  live: boolean;
  /** Length of the reporting window in days. */
  rangeDays: number;
  /** Number of configured accounts. */
  accounts: number;
  totals: {
    followers: number;
    followersChangeWeek: MetricDelta;
    followersChangeMonth: MetricDelta;
    posts: number;
    mentions: number;
    reactions: number;
  };
  platforms: PlatformMetrics[];
  hashtags: HashtagMetric[];
}

export interface SocialProvider {
  readonly id: string;
  readonly live: boolean;
  getMetrics(accounts: SocialAccount[], rangeDays: number): Promise<PlatformMetrics[]>;
  getHashtagMetrics(tags: string[], rangeDays: number): Promise<HashtagMetric[]>;
}
