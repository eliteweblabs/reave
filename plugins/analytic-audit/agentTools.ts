/**
 * Analytic audit agent tools — GSC, GA4, Plausible, IndexNow, Bing placeholders.
 */
import { hasFeature } from '../../src/lib/features';
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  analyticsFailedPayload,
  isGoogleWebmasterOAuthConfigured,
  resolveGoogleSubject,
} from '../../src/lib/googleWebmasterAuth';
import {
  gscAddSite,
  gscInspectUrl,
  gscListSites,
  gscListSitemaps,
  gscPropertyCandidates,
  gscSearchAnalytics,
  gscSubmitSitemap,
} from '../../src/lib/googleSearchConsoleClient';
import {
  getDnsTxtVerificationToken,
  tryPublishGoogleDnsTxt,
  verifyDomainViaDnsTxt,
} from '../../src/lib/googleSiteVerification';
import { ga4DashboardStats, ga4ListProperties, ga4RunReport } from '../../src/lib/ga4Client';
import {
  indexNowKey,
  indexNowSubmit,
  inferIndexNowHost,
  isIndexNowConfigured,
} from '../../src/lib/indexNowClient';
import { bingWebmasterPlaceholder } from '../../src/lib/bingWebmasterClient';
import {
  isPlausibleConfigured,
  plausibleAggregate,
  plausibleBreakdown,
  plausiblePeriodForDays,
  plausibleTimeseries,
} from '../../src/lib/plausibleClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function requireSiteUrl(args: Record<string, unknown>): string | null {
  const siteUrl = String(args.site_url ?? args.siteUrl ?? '').trim();
  return siteUrl || null;
}

function catchAnalytics(e: unknown): string {
  if (e instanceof AnalyticsAuthError || e instanceof AnalyticsApiError) {
    return analyticsFailedPayload(e.message, {
      code: e instanceof AnalyticsAuthError ? e.code : e.code,
      status: e instanceof AnalyticsApiError ? e.status : null,
    });
  }
  return analyticsFailedPayload(e instanceof Error ? e.message : String(e));
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handle_gsc_list_sites(args: Record<string, unknown>): Promise<string> {
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const sites = await gscListSites(subject);
    return JSON.stringify({ ok: true, count: sites.length, sites });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_gsc_search_analytics(args: Record<string, unknown>): Promise<string> {
  const siteUrl = requireSiteUrl(args);
  if (!siteUrl) {
    return analyticsFailedPayload('site_url is required (never defaulted — pass the property explicitly)');
  }
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const endDate = String(args.end_date ?? todayIso()).trim();
    const startDate = String(args.start_date ?? daysAgoIso(28)).trim();
    const dimensionsRaw = args.dimensions;
    const dimensions = Array.isArray(dimensionsRaw)
      ? dimensionsRaw.map((d) => String(d))
      : typeof dimensionsRaw === 'string' && dimensionsRaw.trim()
        ? dimensionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : ['query'];
    const result = await gscSearchAnalytics({
      siteUrl,
      startDate,
      endDate,
      dimensions,
      rowLimit: typeof args.row_limit === 'number' ? args.row_limit : 25,
      searchType: args.search_type != null ? String(args.search_type) : undefined,
      subject,
    });
    return JSON.stringify({
      ok: true,
      siteUrl,
      startDate,
      endDate,
      dimensions,
      rowCount: result.rows.length,
      rows: result.rows,
      responseAggregationType: result.responseAggregationType,
    });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_gsc_inspect_url(args: Record<string, unknown>): Promise<string> {
  const inspectionUrl = String(args.inspection_url ?? args.url ?? '').trim();
  const siteUrl = requireSiteUrl(args);
  if (!inspectionUrl || !siteUrl) {
    return analyticsFailedPayload('inspection_url and site_url are required');
  }
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const result = await gscInspectUrl({
      inspectionUrl,
      siteUrl,
      languageCode: args.language_code != null ? String(args.language_code) : 'en-US',
      subject,
    });
    return JSON.stringify({ ok: true, inspectionUrl, siteUrl, ...result });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_gsc_list_sitemaps(args: Record<string, unknown>): Promise<string> {
  const siteUrl = requireSiteUrl(args);
  if (!siteUrl) return analyticsFailedPayload('site_url is required');
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const sitemaps = await gscListSitemaps(siteUrl, subject);
    return JSON.stringify({ ok: true, siteUrl, count: sitemaps.length, sitemaps });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_gsc_submit_sitemap(args: Record<string, unknown>): Promise<string> {
  const siteUrl = requireSiteUrl(args);
  const feedpath = String(args.feedpath ?? args.sitemap_url ?? '').trim();
  if (!siteUrl || !feedpath) {
    return analyticsFailedPayload('site_url and feedpath (sitemap URL) are required');
  }
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    await gscSubmitSitemap(siteUrl, feedpath, subject);
    return JSON.stringify({ ok: true, siteUrl, feedpath, submitted: true });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_gsc_add_site(args: Record<string, unknown>): Promise<string> {
  const siteUrl = requireSiteUrl(args);
  if (!siteUrl) {
    return analyticsFailedPayload(
      'site_url is required (e.g. sc-domain:example.com or https://example.com/)',
    );
  }
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const tryDns = args.try_dns_verify !== false;
    await gscAddSite(siteUrl, subject);

    let verification: Record<string, unknown> | null = null;
    if (tryDns) {
      const domain =
        siteUrl.startsWith('sc-domain:')
          ? siteUrl.slice('sc-domain:'.length)
          : siteUrl;
      const tokenInfo = await getDnsTxtVerificationToken(domain, subject);
      const dns = await tryPublishGoogleDnsTxt({
        domain: tokenInfo.identifier,
        token: tokenInfo.token,
        namecomUsername:
          args.namecom_username != null ? String(args.namecom_username) : undefined,
        namecomToken: args.namecom_token != null ? String(args.namecom_token) : undefined,
      });
      let verified = false;
      let verifyError: string | null = null;
      if (dns.ok) {
        // Brief pause so DNS can settle (best-effort; Google may still need more time).
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await verifyDomainViaDnsTxt(tokenInfo.identifier, subject);
          verified = true;
        } catch (e) {
          verifyError = e instanceof Error ? e.message : String(e);
        }
      }
      verification = {
        dnsTxtToken: tokenInfo.token,
        dnsPublish: dns,
        verified,
        verifyError,
        candidates: gscPropertyCandidates(domain),
        note: verified
          ? 'Property added and DNS-verified.'
          : 'Property added. If verification failed, publish the TXT token and re-call with try_dns_verify true, or verify in Search Console.',
      };
      if (!verified) {
        return analyticsFailedPayload(
          verifyError ||
            dns.detail ||
            'Site added to Search Console but not verified yet — analytics data unavailable until verified.',
          { siteUrl, verification },
        );
      }
    }

    return JSON.stringify({ ok: true, siteUrl, added: true, verification });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_plausible_stats(args: Record<string, unknown>): Promise<string> {
  const siteId = String(args.site_id ?? '').trim();
  if (!siteId) {
    return analyticsFailedPayload(
      'site_id is required for Plausible (never defaulted to company domain)',
    );
  }
  if (!isPlausibleConfigured()) {
    return analyticsFailedPayload('Plausible is not configured (PLAUSIBLE_API_BASE_URL / PLAUSIBLE_API_KEY)');
  }
  try {
    const days = typeof args.days === 'number' ? args.days : 30;
    const period = plausiblePeriodForDays(days);
    const [aggregate, timeseries, pages, sources] = await Promise.all([
      plausibleAggregate(siteId, period, [
        'visitors',
        'pageviews',
        'bounce_rate',
        'visit_duration',
      ]),
      plausibleTimeseries(siteId, period, ['visitors', 'pageviews']),
      plausibleBreakdown(siteId, period, 'event:page', 8),
      plausibleBreakdown(siteId, period, 'visit:source', 8),
    ]);
    const failed = [aggregate, timeseries, pages, sources].find((r) => !r.ok);
    if (failed && !failed.ok) {
      return analyticsFailedPayload(failed.error, { siteId, period });
    }
    return JSON.stringify({
      ok: true,
      siteId,
      period,
      days,
      aggregate: aggregate.ok ? aggregate.data : null,
      timeseries: timeseries.ok ? timeseries.data : null,
      topPages: pages.ok ? pages.data : null,
      topSources: sources.ok ? sources.data : null,
    });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_ga4_stats(args: Record<string, unknown>): Promise<string> {
  const propertyId = String(args.property_id ?? '').trim();
  if (!propertyId) {
    return analyticsFailedPayload('property_id is required for GA4 (e.g. 123456789)');
  }
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const days = typeof args.days === 'number' ? args.days : 30;
    if (args.raw_report === true) {
      const endDate = String(args.end_date ?? todayIso()).trim();
      const startDate = String(args.start_date ?? daysAgoIso(days)).trim();
      const metrics = Array.isArray(args.metrics)
        ? args.metrics.map(String)
        : ['activeUsers', 'screenPageViews'];
      const dimensions = Array.isArray(args.dimensions)
        ? args.dimensions.map(String)
        : undefined;
      const report = await ga4RunReport({
        propertyId,
        startDate,
        endDate,
        metrics,
        dimensions,
        limit: typeof args.row_limit === 'number' ? args.row_limit : 25,
        subject,
      });
      return JSON.stringify({ ok: true, propertyId, startDate, endDate, ...report });
    }
    const stats = await ga4DashboardStats({ propertyId, rangeDays: days, subject });
    return JSON.stringify({ ok: true, ...stats });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_ga4_list_properties(args: Record<string, unknown>): Promise<string> {
  try {
    const subject = resolveGoogleSubject(
      args.contact_uid != null ? String(args.contact_uid) : null,
    );
    const properties = await ga4ListProperties(subject);
    return JSON.stringify({ ok: true, count: properties.length, properties });
  } catch (e) {
    return catchAnalytics(e);
  }
}

async function handle_indexnow_submit_urls(args: Record<string, unknown>): Promise<string> {
  const urlList = Array.isArray(args.url_list)
    ? args.url_list.map(String)
    : typeof args.url === 'string'
      ? [args.url]
      : [];
  if (!urlList.length) {
    return JSON.stringify({
      ok: false,
      error: 'url_list is required',
      hint: 'IndexNow is only for sites you control (key file on the host).',
    });
  }
  const host =
    String(args.host ?? '').trim() || inferIndexNowHost(urlList) || '';
  if (!host) {
    return JSON.stringify({ ok: false, error: 'host is required (or provide absolute urls)' });
  }
  if (!isIndexNowConfigured() && !String(args.key ?? '').trim()) {
    return JSON.stringify({
      ok: false,
      error: 'INDEXNOW_KEY not set',
      hint: 'Only use IndexNow on properties you host; pass key + key_location if not using env.',
    });
  }
  const result = await indexNowSubmit({
    host,
    urlList,
    key: args.key != null ? String(args.key) : indexNowKey() || undefined,
    keyLocation: args.key_location != null ? String(args.key_location) : undefined,
  });
  return JSON.stringify(result);
}

async function handle_bing_webmaster_placeholder(args: Record<string, unknown>): Promise<string> {
  const tool = String(args.tool ?? 'bing_webmaster').trim() || 'bing_webmaster';
  return bingWebmasterPlaceholder(tool);
}

export const analyticAuditAgentTools: AgentToolModule = {
  id: 'analyticAudit',
  enabled: () => hasFeature('analytic_audit'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    const googleReady = isGoogleWebmasterOAuthConfigured();
    return [
      {
        type: 'function',
        function: {
          name: 'gsc_list_sites',
          description:
            'List Google Search Console properties for the connected Google account (agency by default, or contact_uid override). Requires Google OAuth connect.' +
            (googleReady ? '' : ' GOOGLE_CLIENT_ID/SECRET not set yet.'),
          parameters: {
            type: 'object',
            properties: {
              contact_uid: {
                type: 'string',
                description: 'Optional contact uid when using a per-client Google token',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'gsc_search_analytics',
          description:
            'Query Search Console Search Analytics (clicks, impressions, CTR, position). Always pass site_url explicitly — never assume company domain. On ANALYTICS_FAILED, mark the analytics section Failed and do not invent metrics.',
          parameters: {
            type: 'object',
            properties: {
              site_url: {
                type: 'string',
                description: 'GSC property, e.g. sc-domain:example.com or https://example.com/',
              },
              start_date: { type: 'string', description: 'YYYY-MM-DD (default ~28 days ago)' },
              end_date: { type: 'string', description: 'YYYY-MM-DD (default today)' },
              dimensions: {
                type: 'array',
                items: { type: 'string' },
                description: 'e.g. query, page, country, device, date',
              },
              row_limit: { type: 'number' },
              search_type: { type: 'string', description: 'web | image | video | news | discover | googleNews' },
              contact_uid: { type: 'string' },
            },
            required: ['site_url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'gsc_inspect_url',
          description:
            'URL Inspection API — index status for a URL under a GSC property (read-only; cannot request indexing via API).',
          parameters: {
            type: 'object',
            properties: {
              inspection_url: { type: 'string' },
              site_url: { type: 'string' },
              language_code: { type: 'string' },
              contact_uid: { type: 'string' },
            },
            required: ['inspection_url', 'site_url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'gsc_list_sitemaps',
          description: 'List sitemaps submitted for a Search Console property.',
          parameters: {
            type: 'object',
            properties: {
              site_url: { type: 'string' },
              contact_uid: { type: 'string' },
            },
            required: ['site_url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'gsc_submit_sitemap',
          description: 'Submit (or re-submit) a sitemap URL to Search Console for a property.',
          parameters: {
            type: 'object',
            properties: {
              site_url: { type: 'string' },
              feedpath: { type: 'string', description: 'Full sitemap URL' },
              contact_uid: { type: 'string' },
            },
            required: ['site_url', 'feedpath'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'gsc_add_site',
          description:
            'Add a property to the connected Search Console account. When try_dns_verify is true (default), requests a DNS TXT token and attempts Cloudflare/Name.com publish + verification when credentials exist.',
          parameters: {
            type: 'object',
            properties: {
              site_url: {
                type: 'string',
                description: 'Prefer sc-domain:example.com for domain properties',
              },
              try_dns_verify: { type: 'boolean', description: 'Default true' },
              namecom_username: { type: 'string' },
              namecom_token: { type: 'string' },
              contact_uid: { type: 'string' },
            },
            required: ['site_url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'plausible_stats',
          description:
            'Fetch Plausible aggregate/timeseries/top pages & sources for an explicit site_id. Never default to company domain. On failure return ANALYTICS_FAILED — do not invent numbers.',
          parameters: {
            type: 'object',
            properties: {
              site_id: { type: 'string', description: 'Plausible site id (usually bare domain)' },
              days: { type: 'number', description: '7, 30, or 90 (default 30)' },
            },
            required: ['site_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'ga4_list_properties',
          description: 'List GA4 properties visible to the connected Google account.',
          parameters: {
            type: 'object',
            properties: { contact_uid: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'ga4_stats',
          description:
            'GA4 dashboard stats (or raw_report) for an explicit property_id. Prefer Plausible when the client uses it; use GA4 when they stick with Google Analytics.',
          parameters: {
            type: 'object',
            properties: {
              property_id: { type: 'string' },
              days: { type: 'number' },
              contact_uid: { type: 'string' },
              raw_report: { type: 'boolean' },
              start_date: { type: 'string' },
              end_date: { type: 'string' },
              metrics: { type: 'array', items: { type: 'string' } },
              dimensions: { type: 'array', items: { type: 'string' } },
              row_limit: { type: 'number' },
            },
            required: ['property_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'indexnow_submit_urls',
          description:
            'Submit URL updates via IndexNow (Bing/Yandex/etc — NOT Google). Only for sites you control with a hosted key file. Do NOT call during sales prospect full audits.',
          parameters: {
            type: 'object',
            properties: {
              host: { type: 'string' },
              url_list: { type: 'array', items: { type: 'string' } },
              key: { type: 'string' },
              key_location: { type: 'string' },
            },
            required: ['url_list'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'bing_webmaster_status',
          description:
            'Bing Webmaster Tools placeholder — returns BING_NOT_CONFIGURED until API wiring ships. Do not invent Bing data.',
          parameters: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: 'Optional label for the stub response' },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    gsc_list_sites: handle_gsc_list_sites,
    gsc_search_analytics: handle_gsc_search_analytics,
    gsc_inspect_url: handle_gsc_inspect_url,
    gsc_list_sitemaps: handle_gsc_list_sitemaps,
    gsc_submit_sitemap: handle_gsc_submit_sitemap,
    gsc_add_site: handle_gsc_add_site,
    plausible_stats: handle_plausible_stats,
    ga4_list_properties: handle_ga4_list_properties,
    ga4_stats: handle_ga4_stats,
    indexnow_submit_urls: handle_indexnow_submit_urls,
    bing_webmaster_status: handle_bing_webmaster_placeholder,
  },
};
