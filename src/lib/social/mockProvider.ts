/**
 * Deterministic mock social provider.
 *
 * Numbers are generated from a hash of the platform + handle, so a given
 * account always renders the same figures across reloads (no flickering demo
 * data) while still looking realistic. Replace with a real provider by
 * implementing the same `SocialProvider` interface.
 */
import type {
  HashtagMetric,
  MetricDelta,
  PlatformMetrics,
  SeriesPoint,
  SocialAccount,
  SocialPlatformId,
  SocialProvider,
} from './types.ts';

/** Rough follower ceilings per platform so scale feels plausible. */
const FOLLOWER_BASE: Record<SocialPlatformId, [number, number]> = {
  twitter: [1_800, 42_000],
  instagram: [2_500, 68_000],
  linkedin: [900, 26_000],
  facebook: [1_200, 38_000],
  youtube: [400, 15_000],
  tiktok: [3_000, 120_000],
  bluesky: [600, 18_000],
  threads: [800, 22_000],
  pinterest: [700, 20_000],
  snapchat: [1_500, 45_000],
  discord: [200, 8_000],
  reddit: [300, 12_000],
  github: [150, 6_000],
  twitch: [250, 9_000],
  telegram: [400, 14_000],
  whatsapp: [100, 3_000],
  substack: [200, 7_500],
  yelp: [50, 2_000],
  googlebusiness: [80, 2_500],
};

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, seedable PRNG. */
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

function lerp(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function delta(current: number, past: number): MetricDelta {
  const absolute = current - past;
  const percent = past > 0 ? (absolute / past) * 100 : 0;
  return { absolute, percent: Math.round(percent * 10) / 10 };
}

function buildFollowerSeries(
  rng: () => number,
  current: number,
  rangeDays: number,
): SeriesPoint[] {
  // Walk backwards from today, removing a small daily gain (mostly positive,
  // occasionally flat/negative) so the series trends up to `current`.
  const points: SeriesPoint[] = [];
  let value = current;
  for (let i = 0; i < rangeDays; i++) {
    points.push({ date: isoDate(i), value: Math.round(value) });
    const dailyGrowth = lerp(rng, -0.0009, 0.0055); // net-positive drift
    value = value / (1 + dailyGrowth);
  }
  return points.reverse();
}

function valueAt(series: SeriesPoint[], daysAgo: number): number {
  const idx = series.length - 1 - daysAgo;
  if (idx < 0) return series[0]?.value ?? 0;
  return series[idx]?.value ?? 0;
}

function metricsForAccount(account: SocialAccount, rangeDays: number): PlatformMetrics {
  const seed = hashString(`${account.platform}:${account.handle.toLowerCase()}`);
  const rng = makeRng(seed);

  const [lo, hi] = FOLLOWER_BASE[account.platform];
  const followers = Math.round(lerp(rng, lo, hi));
  const series = buildFollowerSeries(rng, followers, rangeDays);

  const weekAgo = valueAt(series, 7);
  const monthAgo = valueAt(series, Math.min(rangeDays - 1, 30));

  // Activity counts are per-30-days, scaled to the actual reporting window.
  const windowScale = rangeDays / 30;
  const posts = Math.max(1, Math.round(lerp(rng, 4, 26) * windowScale));
  const mentions = Math.round(followers * lerp(rng, 0.002, 0.012) * windowScale);
  // Reactions scale with posting cadence and audience size.
  const reactions = Math.round(posts * followers * lerp(rng, 0.0008, 0.004));
  const engagementRate = followers > 0
    ? Math.round((reactions / followers) * 1000) / 10
    : 0;

  return {
    platform: account.platform,
    label: account.label,
    handle: account.handle,
    url: account.url,
    followers,
    followersLabel: account.followersLabel,
    followerSeries: series,
    change: {
      week: delta(followers, weekAgo),
      month: delta(followers, monthAgo),
    },
    posts,
    mentions,
    reactions,
    engagementRate,
  };
}

function hashtagMetric(tag: string, rangeDays: number): HashtagMetric {
  const clean = tag.replace(/^#/, '').trim();
  const rng = makeRng(hashString(`#${clean.toLowerCase()}`));
  const mentions = Math.round(lerp(rng, 30, 1400) * (rangeDays / 30));
  const reach = Math.round(mentions * lerp(rng, 12, 90));
  const prevMentions = Math.round(mentions / (1 + lerp(rng, -0.25, 0.4)));
  return {
    tag: `#${clean}`,
    mentions,
    reach,
    change: delta(mentions, prevMentions),
  };
}

export const mockSocialProvider: SocialProvider = {
  id: 'mock',
  live: false,
  async getMetrics(accounts, rangeDays) {
    return accounts.map((a) => metricsForAccount(a, rangeDays));
  },
  async getHashtagMetrics(tags, rangeDays) {
    return tags
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean)
      .map((t) => hashtagMetric(t, rangeDays));
  },
};
