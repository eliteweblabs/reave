/**
 * Guard: Kinsta fleet discovery collects additional custom domains, not just primary.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-kinsta-fleet.ts
 */
import assert from 'node:assert/strict';
import {
  kinstaEnvironmentCanonicalApexDomain,
  kinstaEnvironmentDomainNames,
} from '../src/lib/kinstaClient.ts';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from '../src/lib/publicUrl.ts';

const kinstaPrimaryOnly = kinstaEnvironmentDomainNames({
  primary_domain: 'levineslaw.kinsta.cloud',
  domains: ['levineslaw.kinsta.cloud'],
});
assert.equal(kinstaPrimaryOnly.length, 0, 'default kinsta.cloud hostnames are excluded');

const withCustom = kinstaEnvironmentDomainNames({
  primary_domain: 'levineslaw.kinsta.cloud',
  domains: ['levineslaw.kinsta.cloud', 'levineslaw.com', 'www.levineslaw.com'],
});
assert.deepEqual(withCustom.sort(), ['levineslaw.com', 'www.levineslaw.com']);

const apexHosts = [
  ...new Set(
    withCustom
      .map((domain) => normalizeMonitorHost(domain))
      .filter((host): host is string => Boolean(host && isApexPublicWebsiteHost(host))),
  ),
];
assert.deepEqual(apexHosts, ['levineslaw.com']);

assert.equal(
  kinstaEnvironmentCanonicalApexDomain({
    primary_domain: 'levineslaw.kinsta.cloud',
    domains: ['levineslaw.kinsta.cloud', 'levineslaw.com', 'www.levineslaw.com'],
  }),
  'levineslaw.com',
);

assert.equal(
  kinstaEnvironmentCanonicalApexDomain({
    primary_domain: 'paradigmlandscape.com',
    domains: ['paradigmlandscape.com', 'old-paradigm-landscape.com'],
  }),
  'paradigmlandscape.com',
);

console.log('verify-kinsta-fleet: ok');
