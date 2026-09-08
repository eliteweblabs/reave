/**
 * Google Ads agent tools — campaign management for Search geo campaigns.
 */
import { hasFeature } from '../../src/lib/features';
import {
  getGoogleAdsConnectionStatus,
  googleAdsFailedPayload,
  isGoogleAdsDeveloperTokenConfigured,
  isGoogleAdsOAuthConfigured,
  GOOGLE_ADS_PROVIDER,
  resolveGoogleAdsSubject,
} from '../../src/lib/googleAdsAuth';
import {
  buildDrPawsGeoCampaignPlan,
  catchGoogleAdsToolError,
  createSearchCampaignFromPlan,
  googleAdsAdGroupPerformance,
  listAccessibleGoogleAdsCustomers,
  listGoogleAdsCampaigns,
  normalizeCustomerId,
  resolveGoogleAdsCustomerId,
  type SearchCampaignPlan,
} from '../../src/lib/googleAdsClient';
import { getIntegrationToken } from '../../src/lib/integrationTokens';
import { siteBaseUrl } from '../../src/lib/requestOrigin';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handle_google_ads_status(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!hasFeature('google_ads')) {
    return googleAdsFailedPayload('google_ads feature is not enabled in install config');
  }
  const subject = resolveGoogleAdsSubject(
    args.contact_uid != null ? String(args.contact_uid) : null,
  );
  const connection = await getGoogleAdsConnectionStatus(subject);
  const token = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  const customerId = resolveGoogleAdsCustomerId(token?.meta);

  return JSON.stringify({
    ok: true,
    feature: 'google_ads',
    oauthConfigured: isGoogleAdsOAuthConfigured(),
    developerTokenConfigured: isGoogleAdsDeveloperTokenConfigured(),
    customerId,
    connected: connection.connected,
    accountLabel: connection.accountLabel,
    connectUrl: '/api/admin/google-ads/connect',
    auditLog: Array.isArray(token?.meta?.auditLog) ? token!.meta!.auditLog : [],
    instruction:
      'Connect Google Ads in admin (GET /api/admin/google-ads/connect), set GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID on Railway. Mutations default to dry_run=true — pass confirm=true to apply.',
  });
}

async function handle_google_ads_list_accessible_customers(
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const subject = resolveGoogleAdsSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const customers = await listAccessibleGoogleAdsCustomers(subject);
    return JSON.stringify({ ok: true, count: customers.length, customerIds: customers });
  } catch (e) {
    return catchGoogleAdsToolError(e);
  }
}

async function handle_google_ads_list_campaigns(args: Record<string, unknown>): Promise<string> {
  try {
    const subject = resolveGoogleAdsSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const statusRaw = String(args.status ?? 'ALL').toUpperCase();
    const status =
      statusRaw === 'ENABLED' || statusRaw === 'PAUSED' || statusRaw === 'REMOVED'
        ? statusRaw
        : 'ALL';
    const campaigns = await listGoogleAdsCampaigns({
      subject,
      status,
      limit: typeof args.limit === 'number' ? args.limit : 50,
    });
    return JSON.stringify({ ok: true, count: campaigns.length, campaigns });
  } catch (e) {
    return catchGoogleAdsToolError(e);
  }
}

async function handle_google_ads_campaign_performance(
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const subject = resolveGoogleAdsSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const endDate = String(args.end_date ?? todayIso()).trim();
    const startDate = String(args.start_date ?? daysAgoIso(28)).trim();
    const rows = await googleAdsAdGroupPerformance({
      subject,
      startDate,
      endDate,
      campaignNameContains:
        args.campaign_name_contains != null
          ? String(args.campaign_name_contains)
          : undefined,
      limit: typeof args.limit === 'number' ? args.limit : 100,
    });

    const byLandingPage = new Map<
      string,
      {
        finalUrl: string;
        adGroups: string[];
        costMicros: number;
        clicks: number;
        impressions: number;
        conversions: number;
      }
    >();
    for (const row of rows) {
      const key = row.finalUrl ?? '(no final url)';
      const existing = byLandingPage.get(key) ?? {
        finalUrl: key,
        adGroups: [],
        costMicros: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
      };
      existing.adGroups.push(row.adGroupName);
      existing.costMicros += row.costMicros ?? 0;
      existing.clicks += row.clicks ?? 0;
      existing.impressions += row.impressions ?? 0;
      existing.conversions += row.conversions ?? 0;
      byLandingPage.set(key, existing);
    }

    return JSON.stringify({
      ok: true,
      startDate,
      endDate,
      rowCount: rows.length,
      rows,
      landingPageRollup: [...byLandingPage.values()].sort(
        (a, b) => b.costMicros - a.costMicros,
      ),
      format: 'json',
    });
  } catch (e) {
    return catchGoogleAdsToolError(e);
  }
}

async function handle_google_ads_create_search_campaign(
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const subject = resolveGoogleAdsSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const dryRun = args.dry_run !== false && args.dry_run !== 'false';
    const confirm = args.confirm === true || args.confirm === 'true';

    const plan: SearchCampaignPlan = {
      campaignName: String(args.campaign_name ?? 'Search Campaign').trim(),
      dailyBudgetUsd: Number(args.daily_budget_usd ?? 25),
      status: args.status === 'ENABLED' ? 'ENABLED' : 'PAUSED',
      adGroups: [],
      campaignNegativeKeywords: Array.isArray(args.campaign_negative_keywords)
        ? args.campaign_negative_keywords.map(String)
        : ['jobs', 'salary'],
    };

    const adGroupsRaw = args.ad_groups;
    if (Array.isArray(adGroupsRaw) && adGroupsRaw.length) {
      for (const g of adGroupsRaw) {
        if (!g || typeof g !== 'object') continue;
        const group = g as Record<string, unknown>;
        const keywordsRaw = group.keywords;
        const keywords = Array.isArray(keywordsRaw)
          ? keywordsRaw.map((k) => {
              const kw = k as Record<string, unknown>;
              return {
                text: String(kw.text ?? ''),
                matchType: (String(kw.match_type ?? 'PHRASE').toUpperCase() ||
                  'PHRASE') as 'EXACT' | 'PHRASE' | 'BROAD',
              };
            })
          : [];
        const adRaw = (group.ad as Record<string, unknown>) ?? {};
        plan.adGroups.push({
          name: String(group.name ?? 'Ad Group'),
          keywords,
          negativeKeywords: Array.isArray(group.negative_keywords)
            ? group.negative_keywords.map(String)
            : undefined,
          geoTargetNames: Array.isArray(group.geo_target_names)
            ? group.geo_target_names.map(String)
            : undefined,
          ad: {
            headlines: Array.isArray(adRaw.headlines)
              ? adRaw.headlines.map(String)
              : ['Headline'],
            descriptions: Array.isArray(adRaw.descriptions)
              ? adRaw.descriptions.map(String)
              : ['Description'],
            finalUrl: String(adRaw.final_url ?? adRaw.finalUrl ?? ''),
            path1: adRaw.path1 != null ? String(adRaw.path1) : undefined,
            path2: adRaw.path2 != null ? String(adRaw.path2) : undefined,
          },
        });
      }
    } else {
      return googleAdsFailedPayload('ad_groups array is required for custom campaigns');
    }

    const result = await createSearchCampaignFromPlan({ plan, subject, dryRun, confirm });
    return JSON.stringify(result);
  } catch (e) {
    return catchGoogleAdsToolError(e);
  }
}

async function handle_google_ads_provision_dr_paws_geo(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  try {
    const subject = resolveGoogleAdsSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const dryRun = args.dry_run !== false && args.dry_run !== 'false';
    const confirm = args.confirm === true || args.confirm === 'true';
    const siteOrigin = String(args.site_origin ?? '').trim() || siteBaseUrl() || 'https://drpawscalls.com';

    const plan = buildDrPawsGeoCampaignPlan({
      siteOrigin,
      dailyBudgetUsd: Number(args.daily_budget_usd ?? 30),
      campaignName:
        args.campaign_name != null
          ? String(args.campaign_name)
          : 'Dr. Paws Calls — Search — Geo Towns',
    });

    const result = await createSearchCampaignFromPlan({ plan, subject, dryRun, confirm });
    return JSON.stringify({
      ...result,
      service: 'Dr. Paws Calls — in-home veterinary house calls',
      campaignType: 'SEARCH',
      useCase: 'BULK_CREATE',
      townCount: plan.adGroups.length,
      towns: plan.adGroups.map((g) => ({ name: g.name, finalUrl: g.ad.finalUrl })),
    });
  } catch (e) {
    return catchGoogleAdsToolError(e);
  }
}

async function handle_google_ads_set_customer_id(args: Record<string, unknown>): Promise<string> {
  const subject = resolveGoogleAdsSubject(
    args.contact_uid != null ? String(args.contact_uid) : null,
  );
  const customerId = normalizeCustomerId(String(args.customer_id ?? ''));
  if (!customerId) {
    return googleAdsFailedPayload('customer_id must be a 10-digit Google Ads account id (no dashes)');
  }
  const stored = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  if (!stored) {
    return googleAdsFailedPayload('Connect Google Ads OAuth before setting customer id');
  }
  const { setIntegrationToken } = await import('../../src/lib/integrationTokens');
  await setIntegrationToken({
    subject,
    provider: GOOGLE_ADS_PROVIDER,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    scope: stored.scope,
    expiresAt: stored.expiresAt,
    accountLabel: stored.accountLabel,
    meta: { ...(stored.meta ?? {}), customerId },
  });
  return JSON.stringify({ ok: true, customerId });
}

export const googleAdsAgentTools: AgentToolModule = {
  id: 'google-ads',
  enabled: () => hasFeature('google_ads'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'google_ads_status',
          description:
            'Google Ads module status: OAuth connection, developer token, customer id, connect URL, and recent audit log. Use before any campaign read/write.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_list_accessible_customers',
          description:
            'List Google Ads customer ids accessible to the connected OAuth account (helps pick GOOGLE_ADS_CUSTOMER_ID).',
          parameters: {
            type: 'object',
            properties: {
              contact_uid: { type: 'string', description: 'Optional per-contact OAuth subject' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_set_customer_id',
          description:
            'Persist the 10-digit Google Ads customer id for this install (stored in integration token meta).',
          parameters: {
            type: 'object',
            properties: {
              customer_id: { type: 'string', description: '10-digit Ads account id, no dashes' },
              contact_uid: { type: 'string' },
            },
            required: ['customer_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_list_campaigns',
          description: 'List Google Ads campaigns with budget and recent metrics snapshot.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['ENABLED', 'PAUSED', 'REMOVED', 'ALL'],
                description: 'Filter by campaign status (default ALL)',
              },
              limit: { type: 'number', description: 'Max rows (default 50, max 200)' },
              contact_uid: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_campaign_performance',
          description:
            'Pull ad-group performance for a date range. Rolls up spend/clicks/conversions by final URL (landing page). Returns JSON suitable for CSV export.',
          parameters: {
            type: 'object',
            properties: {
              start_date: { type: 'string', description: 'YYYY-MM-DD (default 28 days ago)' },
              end_date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
              campaign_name_contains: {
                type: 'string',
                description: 'Optional substring filter on campaign name',
              },
              limit: { type: 'number', description: 'Max rows (default 100)' },
              contact_uid: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_create_search_campaign',
          description:
            'Create a Search campaign with ad groups, keywords, negative keywords, and responsive search ads. Defaults to dry_run=true — pass dry_run=false and confirm=true to apply. New campaigns start PAUSED unless status=ENABLED.',
          parameters: {
            type: 'object',
            properties: {
              campaign_name: { type: 'string' },
              daily_budget_usd: { type: 'number', description: 'Daily budget in USD' },
              status: { type: 'string', enum: ['PAUSED', 'ENABLED'] },
              campaign_negative_keywords: {
                type: 'array',
                items: { type: 'string' },
              },
              ad_groups: {
                type: 'array',
                description: 'Ad groups — typically one per location/service/intent dimension',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    keywords: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          text: { type: 'string' },
                          match_type: { type: 'string', enum: ['EXACT', 'PHRASE', 'BROAD'] },
                        },
                        required: ['text'],
                      },
                    },
                    negative_keywords: { type: 'array', items: { type: 'string' } },
                    geo_target_names: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Geo target constant names, e.g. "Springfield, Massachusetts, United States"',
                    },
                    ad: {
                      type: 'object',
                      properties: {
                        headlines: { type: 'array', items: { type: 'string' } },
                        descriptions: { type: 'array', items: { type: 'string' } },
                        final_url: { type: 'string' },
                        path1: { type: 'string' },
                        path2: { type: 'string' },
                      },
                      required: ['headlines', 'descriptions', 'final_url'],
                    },
                  },
                  required: ['name', 'keywords', 'ad'],
                },
              },
              dry_run: {
                type: 'boolean',
                description: 'Preview plan without mutating (default true)',
              },
              confirm: {
                type: 'boolean',
                description: 'Required true with dry_run=false to apply changes',
              },
              contact_uid: { type: 'string' },
            },
            required: ['campaign_name', 'ad_groups'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'google_ads_provision_dr_paws_geo',
          description:
            'Bulk-provision Dr. Paws Calls Search campaign: one ad group per Western MA/CT town, geo keywords, RSA copy, and /vet/{town} landing URLs. dry_run=true by default; confirm=true required to create PAUSED campaign in Google Ads.',
          parameters: {
            type: 'object',
            properties: {
              site_origin: {
                type: 'string',
                description: 'Public site origin for final URLs (default install public URL)',
              },
              daily_budget_usd: { type: 'number', description: 'Default 30' },
              campaign_name: { type: 'string' },
              dry_run: { type: 'boolean' },
              confirm: { type: 'boolean' },
              contact_uid: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    google_ads_status: handle_google_ads_status,
    google_ads_list_accessible_customers: handle_google_ads_list_accessible_customers,
    google_ads_set_customer_id: handle_google_ads_set_customer_id,
    google_ads_list_campaigns: handle_google_ads_list_campaigns,
    google_ads_campaign_performance: handle_google_ads_campaign_performance,
    google_ads_create_search_campaign: handle_google_ads_create_search_campaign,
    google_ads_provision_dr_paws_geo: handle_google_ads_provision_dr_paws_geo,
  },
};
