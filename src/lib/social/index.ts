/**
 * Social dashboard entry point.
 *
 * `getSocialProvider()` is the single swap point for real data: today it always
 * returns the deterministic mock, but a real provider (X API, Instagram Graph,
 * etc.) can be selected here based on configured credentials without touching
 * the API route or the UI.
 */
import type { CompanyConfig } from '../companyConfig.ts';
import { accountsFromCompany } from './accounts.ts';
import { mockSocialProvider } from './mockProvider.ts';
import type { MetricDelta, SocialDashboard, SocialProvider } from './types.ts';

export * from './types.ts';
export { SOCIAL_PLATFORMS, accountsFromCompany, parseHandle } from './accounts.ts';

const DEFAULT_RANGE_DAYS = 30;

/** Resolve the active provider. Real adapters plug in here later. */
export function getSocialProvider(): SocialProvider {
  // e.g. if (serverEnv('X_BEARER_TOKEN')) return xApiProvider;
  return mockSocialProvider;
}

function sumDelta(deltas: MetricDelta[], base: number): MetricDelta {
  const absolute = deltas.reduce((acc, d) => acc + d.absolute, 0);
  const past = base - absolute;
  const percent = past > 0 ? Math.round((absolute / past) * 1000) / 10 : 0;
  return { absolute, percent };
}

/** Derive candidate hashtags from the company name when none are configured. */
function derivedHashtags(company: CompanyConfig): string[] {
  const name = (company.name || '').trim();
  if (!name) return [];
  const compact = name.replace(/[^a-z0-9]+/gi, '');
  const tags = new Set<string>();
  if (compact) tags.add(compact);
  const firstWord = name.split(/\s+/)[0]?.replace(/[^a-z0-9]+/gi, '');
  if (firstWord && firstWord.length > 2) tags.add(firstWord);
  return [...tags];
}

export interface BuildDashboardOptions {
  rangeDays?: number;
  /** Explicit hashtags to track (without the leading #). */
  hashtags?: string[];
}

export async function buildSocialDashboard(
  company: CompanyConfig,
  options: BuildDashboardOptions = {},
): Promise<SocialDashboard> {
  const rangeDays = options.rangeDays ?? DEFAULT_RANGE_DAYS;
  const provider = getSocialProvider();

  const accounts = accountsFromCompany(company);
  const platforms = await provider.getMetrics(accounts, rangeDays);

  const hashtagInput =
    options.hashtags && options.hashtags.length
      ? options.hashtags
      : derivedHashtags(company);
  const hashtags = await provider.getHashtagMetrics(hashtagInput, rangeDays);

  const followers = platforms.reduce((acc, p) => acc + p.followers, 0);
  const totals = {
    followers,
    followersChangeWeek: sumDelta(platforms.map((p) => p.change.week), followers),
    followersChangeMonth: sumDelta(platforms.map((p) => p.change.month), followers),
    posts: platforms.reduce((acc, p) => acc + p.posts, 0),
    mentions: platforms.reduce((acc, p) => acc + p.mentions, 0),
    reactions: platforms.reduce((acc, p) => acc + p.reactions, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    provider: provider.id,
    live: provider.live,
    rangeDays,
    accounts: accounts.length,
    totals,
    platforms,
    hashtags,
  };
}
