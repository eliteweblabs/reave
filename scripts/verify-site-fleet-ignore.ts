/**
 * Guard: Sites fleet ignore — critical count + wiring skip.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-site-fleet-ignore.ts
 */
import assert from 'node:assert/strict';
import {
  annotateSiteHealthFleet,
  effectiveSiteHealthCriticalCount,
  isSiteFleetIgnored,
  normalizeSiteFleetIgnoreSiteId,
} from '../src/lib/siteFleetIgnore.ts';
import type { SiteHealthFleet } from '../src/lib/siteHealthScore.ts';

assert.equal(normalizeSiteFleetIgnoreSiteId('https://www.mavsafe.com/'), 'mavsafe.com');

const ignore = {
  updatedAt: Date.now(),
  sites: {
    'mavsafe.com': { siteId: 'mavsafe.com', reason: 'Legal hold', ignoredAt: Date.now() },
  },
};

assert.equal(isSiteFleetIgnored(ignore, 'mavsafe.com'), true);
assert.equal(isSiteFleetIgnored(ignore, 'reave.app'), false);

const fleet: SiteHealthFleet = {
  checkedAt: Date.now(),
  googleConnected: true,
  siteCount: 2,
  criticalSites: 2,
  sites: {
    'mavsafe.com': {
      grade: 'F',
      score: 12,
      criticalCount: 1,
      issues: [{ code: 'down', severity: 'critical', label: 'Site down' }],
      checkedAt: Date.now(),
    },
    'reave.app': {
      grade: 'B',
      score: 70,
      criticalCount: 1,
      issues: [{ code: 'robots_blocked', severity: 'critical', label: 'robots.txt blocks crawlers' }],
      checkedAt: Date.now(),
    },
  },
};

assert.equal(effectiveSiteHealthCriticalCount(fleet, ignore), 1);

const annotated = annotateSiteHealthFleet(fleet, ignore);
assert.ok(annotated);
assert.equal(annotated!.criticalSites, 1);
assert.equal(annotated!.ignoredSites, 1);
assert.equal(annotated!.sites['mavsafe.com']?.ignored, true);
assert.equal(annotated!.sites['reave.app']?.ignored, false);

console.log('verify-site-fleet-ignore: ok');
