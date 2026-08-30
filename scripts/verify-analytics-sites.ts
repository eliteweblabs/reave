/**
 * Guard: Plausible site hostname + tracker HTML detection + fleet merge + apex filter.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-analytics-sites.ts
 */
import assert from 'node:assert/strict';
import {
  mergeAnalyticsSites,
  mergeDashboardSiteCards,
  summarizeAnalyticsAccounts,
} from '../src/lib/analyticsSiteMerge.ts';
import {
  hostnameFromWebsite,
  htmlHasPlausibleScript,
  isPlausibleSiteExistsError,
  isPlausibleSiteMissingError,
} from '../src/lib/plausibleClient.ts';
import { isApexPublicWebsiteHost, isPublicWebsiteHost } from '../src/lib/publicUrl.ts';

assert.equal(hostnameFromWebsite('https://www.thebarbersedge.com/barbers'), 'thebarbersedge.com');
assert.equal(hostnameFromWebsite('thebarbersedge.com'), 'thebarbersedge.com');
assert.equal(hostnameFromWebsite('https://reave.app'), 'reave.app');
assert.equal(hostnameFromWebsite(''), '');

assert.equal(isPublicWebsiteHost('thebarbersedge.com'), true);
assert.equal(isPublicWebsiteHost('foo.up.railway.app'), false);
assert.equal(isPublicWebsiteHost('example.kinsta.cloud'), false);
assert.equal(isApexPublicWebsiteHost('thebarbersedge.com'), true);
assert.equal(isApexPublicWebsiteHost('www.thebarbersedge.com'), true);
assert.equal(isApexPublicWebsiteHost('cal.thebarbersedge.com'), false);
assert.equal(isApexPublicWebsiteHost('inbound.reave.app'), false);
assert.equal(isApexPublicWebsiteHost('example.co.uk'), true);
assert.equal(isApexPublicWebsiteHost('shop.example.co.uk'), false);
assert.equal(isApexPublicWebsiteHost('foo.up.railway.app'), false);

const beScript =
  '<script defer data-domain="thebarbersedge.com" src="https://plausible-analytics-ce-production-6fd8.up.railway.app/js/script.file-downloads.hash.outbound-links.js"></script>';
assert.equal(htmlHasPlausibleScript(beScript, 'thebarbersedge.com'), true);
assert.equal(htmlHasPlausibleScript(beScript, 'www.thebarbersedge.com'), true);
assert.equal(htmlHasPlausibleScript('<html></html>', 'thebarbersedge.com'), false);
assert.equal(
  htmlHasPlausibleScript(
    '<script data-domain="reave.app" src="https://example.com/js/script.js"></script>',
    'thebarbersedge.com',
  ),
  false,
);

assert.equal(isPlausibleSiteMissingError('Plausible 404: Site not found'), true);
assert.equal(isPlausibleSiteMissingError('Invalid site ID'), true);
assert.equal(isPlausibleSiteMissingError('Plausible 401: unauthorized'), false);
assert.equal(
  isPlausibleSiteMissingError(
    'Invalid API key or site ID. Please make sure you\'re using a valid API key with access to the site you\'ve requested.',
  ),
  true,
);
assert.equal(isPlausibleSiteExistsError('domain has already been taken'), true);

const merged = mergeAnalyticsSites([
  { siteId: 'https://www.reave.app', label: 'reave.app', kind: 'agency' },
  { siteId: 'thebarbersedge.com', label: "Barber's Edge", kind: 'kinsta', sourceLabel: "Barber's Edge" },
  { siteId: 'reave.app', label: 'dup', kind: 'railway' },
  { siteId: 'tonybarlettajr.com', label: 'tonybarlettajr.com', kind: 'railway', sourceLabel: 'Tony / app' },
  null,
]);
assert.equal(merged.length, 3);
assert.equal(merged[0].kind, 'agency');
assert.equal(merged[0].siteId, 'reave.app');
assert.equal(merged[1].kind, 'railway');
assert.equal(merged[1].siteId, 'tonybarlettajr.com');
assert.equal(merged[2].kind, 'kinsta');
assert.equal(merged[2].siteId, 'thebarbersedge.com');

const preview = summarizeAnalyticsAccounts(
  [
    {
      siteId: 'reave.app',
      label: 'reave.app',
      kind: 'agency',
      registered: true,
      visitors: 120,
      pageviews: 400,
      realtimeVisitors: 2,
      change: 10,
      dashboardUrl: null,
    },
    {
      siteId: 'other.com',
      label: 'other.com',
      kind: 'railway',
      registered: false,
      visitors: null,
      pageviews: null,
      realtimeVisitors: null,
      change: null,
      dashboardUrl: null,
    },
  ],
  30,
);
assert.equal(preview.siteCount, 2);
assert.equal(preview.registeredCount, 1);
assert.equal(preview.unregisteredCount, 1);
assert.equal(preview.visitors, 120);
assert.equal(preview.realtimeVisitors, 2);
assert.equal(preview.sites.length, 2);

const fleet = mergeDashboardSiteCards(
  [
    {
      id: 1,
      friendly_name: "The Barber's Edge",
      url: 'https://www.thebarbersedge.com',
      status: 2,
      uptime_ratio_7d: 100,
      tile_label: '100.0%',
    },
    {
      id: 2,
      friendly_name: 'Cal only',
      url: 'https://cal.thebarbersedge.com',
      status: 2,
      uptime_ratio_7d: 99.9,
      tile_label: '99.9%',
    },
    {
      id: 3,
      friendly_name: 'Mavsafe',
      url: 'https://mavsafe.com',
      status: 9,
      is_down: true,
      is_offline: true,
      tile_label: 'down',
    },
  ],
  [
    {
      siteId: 'thebarbersedge.com',
      label: 'thebarbersedge.com',
      kind: 'kinsta',
      sourceLabel: "Barber's Edge",
      registered: true,
      visitors: 209,
      pageviews: 400,
      realtimeVisitors: 0,
      change: null,
      dashboardUrl: null,
    },
    {
      siteId: 'reave.app',
      label: 'reave.app',
      kind: 'agency',
      registered: false,
      visitors: null,
      pageviews: null,
      realtimeVisitors: null,
      change: null,
      dashboardUrl: null,
    },
  ],
);
assert.equal(fleet.length, 3);
assert.equal(fleet[0].siteId, 'mavsafe.com');
assert.equal(fleet[0].label, 'Mavsafe');
assert.equal(fleet[0].monitor?.id, 3);
assert.equal(fleet[0].analytics, null);
assert.equal(fleet[1].siteId, 'reave.app');
assert.equal(fleet[1].monitor, null);
assert.equal(fleet[1].analytics?.registered, false);
assert.equal(fleet[2].siteId, 'thebarbersedge.com');
assert.equal(fleet[2].label, "The Barber's Edge");
assert.equal(fleet[2].analytics?.visitors, 209);

console.log('verify-analytics-sites: ok');
