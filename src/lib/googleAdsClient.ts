/**
 * Google Ads API client — queries, reports, and mutations with retry/quota handling.
 */
import {
  DR_PAWS_ADS_TOWNS,
  drPawsAdsTownPath,
} from './drPawsAdsTowns';
import { GoogleAdsApi, enums, errors, resources, toMicros, ResourceNames } from 'google-ads-api';
import type { MutateOperation } from 'google-ads-api';
import type { IntegrationSubject } from './integrationTokens';
import { createLogger } from './logger';
import {
  appendGoogleAdsAuditEntry,
  getGoogleAdsRefreshToken,
  GoogleAdsAuthError,
  googleAdsFailedPayload,
} from './googleAdsAuth';
import { agencySubject } from './integrationTokens';
import { serverEnv } from './serverEnv.ts';

const log = createLogger('google-ads');

export class GoogleAdsApiError extends Error {
  readonly code = 'GOOGLE_ADS_API' as const;
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GoogleAdsApiError';
    this.status = status;
  }
}

export interface GoogleAdsConfigStatus {
  oauthConfigured: boolean;
  developerTokenConfigured: boolean;
  customerId: string | null;
  loginCustomerId: string | null;
  connected: boolean;
  accountLabel: string | null;
}

export function normalizeCustomerId(raw: string | undefined | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

export function resolveGoogleAdsCustomerId(meta?: Record<string, unknown> | null): string | null {
  const fromMeta =
    typeof meta?.customerId === 'string'
      ? normalizeCustomerId(meta.customerId)
      : typeof meta?.customer_id === 'string'
        ? normalizeCustomerId(meta.customer_id)
        : null;
  return fromMeta ?? normalizeCustomerId(serverEnv('GOOGLE_ADS_CUSTOMER_ID'));
}

export function resolveGoogleAdsLoginCustomerId(meta?: Record<string, unknown> | null): string | null {
  const fromMeta =
    typeof meta?.loginCustomerId === 'string'
      ? normalizeCustomerId(meta.loginCustomerId)
      : typeof meta?.login_customer_id === 'string'
        ? normalizeCustomerId(meta.login_customer_id)
        : null;
  return fromMeta ?? normalizeCustomerId(serverEnv('GOOGLE_ADS_LOGIN_CUSTOMER_ID'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGoogleAdsError(e: unknown): boolean {
  if (e instanceof errors.GoogleAdsFailure) {
    return e.errors.some((err) => {
      const msg = (err.message ?? '').toLowerCase();
      return (
        msg.includes('resource_exhausted') ||
        msg.includes('rate') ||
        msg.includes('quota') ||
        msg.includes('temporarily unavailable') ||
        msg.includes('internal error')
      );
    });
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    return msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('429');
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [500, 1500, 4000];
  let last: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt >= delays.length || !isRetryableGoogleAdsError(e)) throw e;
      log.warn(`${label} retry ${attempt + 1}`, e instanceof Error ? e.message : String(e));
      await sleep(delays[attempt]!);
    }
  }
  throw last;
}

function formatGoogleAdsFailure(e: unknown): string {
  if (e instanceof errors.GoogleAdsFailure) {
    return e.errors.map((err) => err.message ?? String(err)).join('; ');
  }
  if (e instanceof GoogleAdsAuthError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export async function getGoogleAdsApiClient(subject: IntegrationSubject = agencySubject()) {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = serverEnv('GOOGLE_CLIENT_SECRET')?.trim();
  const developerToken = serverEnv('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleAdsAuthError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
  }
  if (!developerToken) {
    throw new GoogleAdsApiError('GOOGLE_ADS_DEVELOPER_TOKEN is not set');
  }

  const refreshToken = await getGoogleAdsRefreshToken(subject);
  const client = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
  return { client, refreshToken, subject };
}

export async function getGoogleAdsCustomer(subject: IntegrationSubject = agencySubject()) {
  const { client, refreshToken, subject: sub } = await getGoogleAdsApiClient(subject);
  const stored = await import('./integrationTokens').then((m) =>
    m.getIntegrationToken(sub, 'google_ads'),
  );
  const customerId = resolveGoogleAdsCustomerId(stored?.meta);
  if (!customerId) {
    throw new GoogleAdsApiError(
      'GOOGLE_ADS_CUSTOMER_ID is not set (10-digit Ads account id, no dashes)',
    );
  }
  const loginCustomerId = resolveGoogleAdsLoginCustomerId(stored?.meta);
  const customer = client.Customer({
    customer_id: customerId,
    refresh_token: refreshToken,
    ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
  });
  return { customer, customerId, loginCustomerId, subject: sub };
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  channelType: string;
  budgetMicros: number | null;
  costMicros: number | null;
  clicks: number | null;
  impressions: number | null;
  conversions: number | null;
}

export async function listGoogleAdsCampaigns(args: {
  subject?: IntegrationSubject;
  status?: 'ENABLED' | 'PAUSED' | 'REMOVED' | 'ALL';
  limit?: number;
}): Promise<CampaignSummary[]> {
  const { customer } = await getGoogleAdsCustomer(args.subject ?? agencySubject());
  const statusFilter =
    !args.status || args.status === 'ALL'
      ? ''
      : `AND campaign.status = "${args.status}"`;
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions
    FROM campaign
    WHERE campaign.id > 0
    ${statusFilter}
    ORDER BY campaign.name
    LIMIT ${limit}
  `;
  const rows = await withRetry(() => customer.query(query), 'listCampaigns');
  return rows.map((row) => ({
    id: String(row.campaign?.id ?? ''),
    name: String(row.campaign?.name ?? ''),
    status: String(row.campaign?.status ?? ''),
    channelType: String(row.campaign?.advertising_channel_type ?? ''),
    budgetMicros: row.campaign_budget?.amount_micros ?? null,
    costMicros: row.metrics?.cost_micros ?? null,
    clicks: row.metrics?.clicks ?? null,
    impressions: row.metrics?.impressions ?? null,
    conversions: row.metrics?.conversions ?? null,
  }));
}

export interface AdGroupPerformanceRow {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  finalUrl: string | null;
  costMicros: number | null;
  clicks: number | null;
  impressions: number | null;
  conversions: number | null;
  ctr: number | null;
}

export async function googleAdsAdGroupPerformance(args: {
  subject?: IntegrationSubject;
  startDate: string;
  endDate: string;
  campaignNameContains?: string;
  limit?: number;
}): Promise<AdGroupPerformanceRow[]> {
  const { customer } = await getGoogleAdsCustomer(args.subject ?? agencySubject());
  const nameFilter = args.campaignNameContains?.trim()
    ? `AND campaign.name LIKE '%${args.campaignNameContains.replace(/'/g, "''")}%'`
    : '';
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.final_urls,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.ctr
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${args.startDate}' AND '${args.endDate}'
    ${nameFilter}
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}
  `;
  const rows = await withRetry(() => customer.query(query), 'adGroupPerformance');
  return rows.map((row) => {
    const urls = row.ad_group_ad?.ad?.final_urls;
    const finalUrl = Array.isArray(urls) && urls.length ? String(urls[0]) : null;
    return {
      campaignId: String(row.campaign?.id ?? ''),
      campaignName: String(row.campaign?.name ?? ''),
      adGroupId: String(row.ad_group?.id ?? ''),
      adGroupName: String(row.ad_group?.name ?? ''),
      finalUrl,
      costMicros: row.metrics?.cost_micros ?? null,
      clicks: row.metrics?.clicks ?? null,
      impressions: row.metrics?.impressions ?? null,
      conversions: row.metrics?.conversions ?? null,
      ctr: row.metrics?.ctr ?? null,
    };
  });
}

export interface SearchKeywordSpec {
  text: string;
  matchType: 'EXACT' | 'PHRASE' | 'BROAD';
}

export interface ResponsiveSearchAdCopy {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1?: string;
  path2?: string;
}

export interface GeoAdGroupPlan {
  name: string;
  keywords: SearchKeywordSpec[];
  negativeKeywords?: string[];
  ad: ResponsiveSearchAdCopy;
  geoTargetNames?: string[];
}

export interface SearchCampaignPlan {
  campaignName: string;
  dailyBudgetUsd: number;
  status: 'PAUSED' | 'ENABLED';
  adGroups: GeoAdGroupPlan[];
  campaignNegativeKeywords?: string[];
}

export function buildDrPawsGeoCampaignPlan(args: {
  siteOrigin: string;
  dailyBudgetUsd?: number;
  campaignName?: string;
}): SearchCampaignPlan {
  const origin = args.siteOrigin.replace(/\/+$/, '');
  const dailyBudgetUsd = args.dailyBudgetUsd ?? 30;

  const adGroups: GeoAdGroupPlan[] = DR_PAWS_ADS_TOWNS.map((town) => {
    const finalUrl = `${origin}${drPawsAdsTownPath(town.slug)}`;
    const townLabel = town.label.replace(/, CT$/, '');
    return {
      name: `${town.name} — House Calls`,
      keywords: [
        { text: `vet house call ${townLabel}`, matchType: 'PHRASE' },
        { text: `mobile vet ${townLabel}`, matchType: 'PHRASE' },
        { text: `veterinarian home visit ${townLabel}`, matchType: 'PHRASE' },
        { text: `in home vet ${townLabel}`, matchType: 'PHRASE' },
      ],
      negativeKeywords: ['emergency', '24 hour', 'cheap', 'free'],
      ad: {
        headlines: [
          `${townLabel} Vet House Calls`,
          'We Come To Your Home',
          'Book In 30 Seconds',
          'Dr. Kara Ryczek, DVM',
          'Same-Day Appointments',
          'Stress-Free Pet Care',
          'No Waiting Room',
          'Trusted Local Vet',
          'In-Home Exams & Care',
          'Serving Your Neighborhood',
        ].slice(0, 15),
        descriptions: [
          `In-home veterinary exams in ${town.label}. Same-day & next-day visits for anxious pets.`,
          'Skip the car ride & waiting room. Dr. Paws Calls brings full-service vet care to your door.',
          'Book online in 30 seconds. House calls for cats, dogs & small pets across Western MA & CT.',
          'Compassionate mobile vet care — exams, vaccines, sick visits & more at home.',
        ].slice(0, 4),
        finalUrl,
        path1: 'vet',
        path2: town.slug.slice(0, 15),
      },
      geoTargetNames: [`${town.name}, ${town.state === 'MA' ? 'Massachusetts' : 'Connecticut'}, United States`],
    };
  });

  return {
    campaignName: args.campaignName ?? 'Dr. Paws Calls — Search — Geo Towns',
    dailyBudgetUsd,
    status: 'PAUSED',
    campaignNegativeKeywords: ['jobs', 'salary', 'school', 'training'],
    adGroups,
  };
}

async function resolveGeoTargetConstantId(
  customer: Awaited<ReturnType<typeof getGoogleAdsCustomer>>['customer'],
  locationName: string,
): Promise<string | null> {
  const safe = locationName.replace(/'/g, "''");
  const query = `
    SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.target_type
    FROM geo_target_constant
    WHERE geo_target_constant.name LIKE '${safe}'
    AND geo_target_constant.target_type IN ('City', 'Neighborhood', 'Postal Code')
    LIMIT 5
  `;
  try {
    const rows = await customer.query(query);
    const match = rows.find((r) => r.geo_target_constant?.resource_name);
    return match?.geo_target_constant?.resource_name
      ? String(match.geo_target_constant.resource_name)
      : null;
  } catch {
    return null;
  }
}

export async function createSearchCampaignFromPlan(args: {
  plan: SearchCampaignPlan;
  subject?: IntegrationSubject;
  dryRun?: boolean;
  confirm?: boolean;
}): Promise<Record<string, unknown>> {
  const dryRun = args.dryRun !== false;
  if (!dryRun && args.confirm !== true) {
    return {
      ok: false,
      error: 'CONFIRMATION_REQUIRED',
      reason: 'Set dry_run=false and confirm=true to mutate Google Ads.',
      plan: args.plan,
    };
  }

  const preview = {
    ok: true,
    dryRun,
    campaignName: args.plan.campaignName,
    dailyBudgetUsd: args.plan.dailyBudgetUsd,
    status: args.plan.status,
    adGroupCount: args.plan.adGroups.length,
    adGroups: args.plan.adGroups.map((g) => ({
      name: g.name,
      keywordCount: g.keywords.length,
      finalUrl: g.ad.finalUrl,
      geoTargetNames: g.geoTargetNames ?? [],
    })),
    campaignNegativeKeywords: args.plan.campaignNegativeKeywords ?? [],
  };

  if (dryRun) return preview;

  const { customer, customerId, subject } = await getGoogleAdsCustomer(args.subject ?? agencySubject());
  const budgetResourceName = ResourceNames.campaignBudget(customerId, '-1');
  const campaignResourceName = ResourceNames.campaign(customerId, '-2');

  const operations: MutateOperation<
    | resources.ICampaignBudget
    | resources.ICampaign
    | resources.IAdGroup
    | resources.IAdGroupCriterion
    | resources.ICampaignCriterion
    | resources.IAdGroupAd
  >[] = [
    {
      entity: 'campaign_budget',
      operation: 'create',
      resource: {
        resource_name: budgetResourceName,
        name: `${args.plan.campaignName} Budget`,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
        amount_micros: toMicros(args.plan.dailyBudgetUsd),
      },
    },
    {
      entity: 'campaign',
      operation: 'create',
      resource: {
        resource_name: campaignResourceName,
        name: args.plan.campaignName,
        advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
        status:
          args.plan.status === 'ENABLED'
            ? enums.CampaignStatus.ENABLED
            : enums.CampaignStatus.PAUSED,
        manual_cpc: { enhanced_cpc_enabled: false },
        campaign_budget: budgetResourceName,
        network_settings: {
          target_google_search: true,
          target_search_network: false,
          target_content_network: false,
        },
      },
    },
  ];

  let tempAdGroupId = -10;
  const createdAdGroups: string[] = [];

  for (const group of args.plan.adGroups) {
    const adGroupResourceName = ResourceNames.adGroup(customerId, String(tempAdGroupId--));
    createdAdGroups.push(group.name);
    operations.push({
      entity: 'ad_group',
      operation: 'create',
      resource: {
        resource_name: adGroupResourceName,
        name: group.name,
        campaign: campaignResourceName,
        status: enums.AdGroupStatus.ENABLED,
        type: enums.AdGroupType.SEARCH_STANDARD,
        cpc_bid_micros: toMicros(2.5),
      },
    });

    for (const kw of group.keywords) {
      operations.push({
        entity: 'ad_group_criterion',
        operation: 'create',
        resource: {
          ad_group: adGroupResourceName,
          status: enums.AdGroupCriterionStatus.ENABLED,
          keyword: {
            text: kw.text,
            match_type:
              kw.matchType === 'EXACT'
                ? enums.KeywordMatchType.EXACT
                : kw.matchType === 'PHRASE'
                  ? enums.KeywordMatchType.PHRASE
                  : enums.KeywordMatchType.BROAD,
          },
        },
      });
    }

    for (const neg of group.negativeKeywords ?? []) {
      operations.push({
        entity: 'ad_group_criterion',
        operation: 'create',
        resource: {
          ad_group: adGroupResourceName,
          negative: true,
          keyword: { text: neg, match_type: enums.KeywordMatchType.BROAD },
        },
      });
    }

    operations.push({
      entity: 'ad_group_ad',
      operation: 'create',
      resource: {
        ad_group: adGroupResourceName,
        status: enums.AdGroupAdStatus.ENABLED,
        ad: {
          final_urls: [group.ad.finalUrl],
          responsive_search_ad: {
            headlines: group.ad.headlines.map((text) => ({ text })),
            descriptions: group.ad.descriptions.map((text) => ({ text })),
            path1: group.ad.path1,
            path2: group.ad.path2,
          },
        },
      },
    });

    for (const geoName of group.geoTargetNames ?? []) {
      const geoResource = await resolveGeoTargetConstantId(customer, geoName);
      if (geoResource) {
        operations.push({
          entity: 'campaign_criterion',
          operation: 'create',
          resource: {
            campaign: campaignResourceName,
            location: { geo_target_constant: geoResource },
          },
        });
      }
    }
  }

  for (const neg of args.plan.campaignNegativeKeywords ?? []) {
    operations.push({
      entity: 'campaign_criterion',
      operation: 'create',
      resource: {
        campaign: campaignResourceName,
        negative: true,
        keyword: { text: neg, match_type: enums.KeywordMatchType.BROAD },
      },
    });
  }

  const result = await withRetry(
    () => customer.mutateResources(operations, { partial_failure: true }),
    'createSearchCampaign',
  );

  await appendGoogleAdsAuditEntry(subject, {
    action: 'create_search_campaign',
    campaignName: args.plan.campaignName,
    adGroupCount: args.plan.adGroups.length,
    resultSummary: String(
      Array.isArray((result as { mutate_operation_responses?: unknown[] })?.mutate_operation_responses)
        ? (result as { mutate_operation_responses: unknown[] }).mutate_operation_responses.length
        : 0,
    ),
  });

  log.info('Created search campaign', {
    campaignName: args.plan.campaignName,
    adGroupCount: createdAdGroups.length,
  });

  const resultCount = Array.isArray((result as { mutate_operation_responses?: unknown[] })?.mutate_operation_responses)
    ? (result as { mutate_operation_responses: unknown[] }).mutate_operation_responses.length
    : 0;

  return {
    ...preview,
    dryRun: false,
    mutated: true,
    operationCount: operations.length,
    resultCount,
  };
}

export async function listAccessibleGoogleAdsCustomers(
  subject: IntegrationSubject = agencySubject(),
): Promise<string[]> {
  const { client, refreshToken } = await getGoogleAdsApiClient(subject);
  const rows = await withRetry(
    () => client.listAccessibleCustomers(refreshToken),
    'listAccessibleCustomers',
  );
  return (rows?.resource_names ?? []).map((name: string) => name.replace('customers/', ''));
}

export function catchGoogleAdsToolError(e: unknown): string {
  if (e instanceof GoogleAdsAuthError || e instanceof GoogleAdsApiError) {
    return googleAdsFailedPayload(e.message, { code: e.code });
  }
  return googleAdsFailedPayload(formatGoogleAdsFailure(e));
}
