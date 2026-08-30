/**
 * Guard: Sites fleet health scoring (critical issues → letter grade).
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-site-health.ts
 */
import assert from 'node:assert/strict';
import { robotsTxtBlocksAll } from '../src/lib/seoInventoryClient.ts';
import {
  collectInstantSiteHealthIssues,
  scoreSiteHealthIssues,
} from '../src/lib/siteHealthScore.ts';

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

console.log('verify-site-health: ok');
