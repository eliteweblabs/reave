/**
 * Guard: Sites fleet health scoring (critical issues → letter grade).
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-site-health.ts
 */
import assert from 'node:assert/strict';
import { robotsTxtBlocksAll } from '../src/lib/seoInventoryClient.ts';
import {
  collectInstantSiteHealthIssues,
  scoreSiteHealthFromReadiness,
  scoreSiteHealthIssues,
} from '../src/lib/siteHealthScore.ts';
import { buildSiteReadinessChecklist } from '../src/lib/siteReadinessChecklist.ts';

assert.equal(robotsTxtBlocksAll('User-agent: *\nDisallow: /\n'), true);
assert.equal(robotsTxtBlocksAll('User-agent: *\nDisallow: /admin\n'), false);
assert.equal(robotsTxtBlocksAll('User-agent: Googlebot\nDisallow: /\nUser-agent: *\nDisallow:\n'), false);

const blocked = collectInstantSiteHealthIssues({
  monitor: { status: 2, uptime_ratio_7d: 100 },
  analytics: {
    siteId: 'example.com',
    label: 'example.com',
    kind: 'railway',
    registered: false,
    visitors: null,
    pageviews: null,
    realtimeVisitors: null,
    change: null,
    dashboardUrl: null,
  },
  googleConnected: true,
  gscHasProperty: false,
  robots: { present: true, blocksAll: true },
});
assert.ok(blocked.some((i) => i.code === 'robots_blocked' && i.severity === 'critical'));
assert.ok(blocked.some((i) => i.code === 'gsc_missing' && i.severity === 'critical'));
assert.ok(blocked.some((i) => i.code === 'plausible_unregistered'));

const scored = scoreSiteHealthIssues(blocked);
assert.equal(scored.grade, 'F');
assert.ok(scored.criticalCount >= 2);
assert.ok(scored.score < 60);

const healthy = collectInstantSiteHealthIssues({
  monitor: { status: 2, tile_label: '100.0%' },
  analytics: {
    siteId: 'ok.com',
    label: 'ok.com',
    kind: 'kinsta',
    registered: true,
    visitors: 10,
    pageviews: 20,
    realtimeVisitors: 0,
    change: null,
    dashboardUrl: null,
  },
  googleConnected: true,
  gscHasProperty: true,
  robots: { present: true, blocksAll: false },
});
assert.equal(healthy.length, 0);
assert.equal(scoreSiteHealthIssues(healthy).grade, 'A');

const down = collectInstantSiteHealthIssues({
  monitor: { status: 9, is_down: true, is_offline: true, tile_label: 'down' },
  analytics: null,
  googleConnected: false,
  gscHasProperty: null,
  robots: null,
});
assert.ok(down.some((i) => i.code === 'down'));
assert.ok(down.some((i) => i.code === 'gsc_unconnected'));
assert.equal(scoreSiteHealthIssues(down).grade, 'F');

const partialReadiness = buildSiteReadinessChecklist({
  seo: null,
  issues: [],
  googleConnected: true,
  gscHasProperty: true,
  gscSitemapCount: 1,
  analytics: {
    siteId: 'partial.com',
    label: 'partial.com',
    kind: 'railway',
    registered: true,
    visitors: 5,
    pageviews: 10,
    realtimeVisitors: 0,
    change: null,
    dashboardUrl: null,
  },
  monitor: { status: 2, uptime_ratio_7d: 100 },
});
assert.ok(partialReadiness.okCount < partialReadiness.totalCount);
const partialGrade = scoreSiteHealthFromReadiness(partialReadiness);
assert.notEqual(partialGrade.grade, 'A');
assert.ok(partialGrade.criticalCount >= 0);

const perfectReadiness = buildSiteReadinessChecklist({
  seo: {
    ok: true,
    url: 'https://perfect.com/',
    final_url: 'https://perfect.com/',
    grade: 'A',
    score: 95,
    items: [],
    issues: [],
    pitches: [],
    open_graph: { title: '', description: '', image: '', url: '', type: '' },
    twitter: { card: '', title: '', description: '', image: '' },
    page: { title: '', meta_description: '', canonical: '', meta_robots: '' },
    favicon: { present: true, href: '/favicon.ico', apple_touch: true },
    manifest: { present: true, href: '/manifest.webmanifest', name: 'Perfect', valid: true },
    robots_txt: { present: true, url: 'https://perfect.com/robots.txt', blocks_all: false, sitemap_refs: [], sample: '' },
    sitemap: { present: true, url: 'https://perfect.com/sitemap.xml', url_count_estimate: 12, status_code: 200 },
    structured_data: { present: true, types: ['Organization'], count: 1 },
    internal_links: { total: 12, serviceLike: 4, samplePaths: ['/services'] },
  },
  issues: [],
  googleConnected: true,
  gscHasProperty: true,
  gscSitemapCount: 1,
  analytics: {
    siteId: 'perfect.com',
    label: 'perfect.com',
    kind: 'railway',
    registered: true,
    visitors: 100,
    pageviews: 200,
    realtimeVisitors: 1,
    change: null,
    dashboardUrl: null,
  },
  monitor: { status: 2, uptime_ratio_7d: 100 },
  pageSpeed: { performanceScore: 90, fieldCategory: 'FAST', detail: 'Fast' },
});
assert.equal(perfectReadiness.okCount, perfectReadiness.totalCount);
assert.equal(scoreSiteHealthFromReadiness(perfectReadiness).grade, 'A');

console.log('verify-site-health: ok');
