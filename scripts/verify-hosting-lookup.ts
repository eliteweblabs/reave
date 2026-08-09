/**
 * Synthetic checks for hosting-company classification (no network).
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-hosting-lookup.ts
 */
import assert from 'node:assert/strict';
import { classifyHostingFromSignals } from '../src/lib/hostingLookupClient.ts';

function check(
  name: string,
  input: Parameters<typeof classifyHostingFromSignals>[0],
  expect: { company: string; tier: string; attribute?: boolean; grade?: string },
) {
  const got = classifyHostingFromSignals(input);
  assert.equal(got.company, expect.company, `${name}: company`);
  assert.equal(got.tier, expect.tier, `${name}: tier`);
  if (expect.attribute != null) {
    assert.equal(
      got.rating.attribute_slow_speed_to_resources,
      expect.attribute,
      `${name}: attribute_slow_speed_to_resources`,
    );
  }
  if (expect.grade) {
    assert.equal(got.rating.hosting_grade, expect.grade, `${name}: grade`);
  }
  console.log(`ok — ${name}: ${got.company} / ${got.tier} / grade ${got.rating.hosting_grade}`);
}

check(
  'Flywheel PTR',
  { ptr: ['site.flywheelsites.com'] },
  { company: 'Flywheel', tier: 'managed_wordpress', attribute: false, grade: 'A' },
);

check(
  'WP Engine powered',
  { org: 'WPEngine, Inc.', ptr: ['123.wpenginepowered.com'] },
  { company: 'WP Engine', tier: 'managed_wordpress', grade: 'A' },
);

check(
  'Kinsta header-adjacent org',
  { org: 'Kinsta Inc.' },
  { company: 'Kinsta', tier: 'managed_wordpress', grade: 'A' },
);

check(
  'GoDaddy secureserver PTR',
  { ptr: ['n1nlhg796c1796.shr.prod.ams1.secureserver.net'], org: 'GoDaddy.com, LLC' },
  { company: 'GoDaddy', tier: 'shared_budget', attribute: true, grade: 'D' },
);

check(
  'GoDaddy nameservers only',
  { nameservers: ['ns07.domaincontrol.com', 'ns08.domaincontrol.com'] },
  { company: 'GoDaddy', tier: 'shared_budget', attribute: true },
);

check(
  'Bluehost unifiedlayer',
  { ptr: ['box1234.bluehost.com'], org: 'Unified Layer' },
  { company: 'Bluehost', tier: 'shared_budget', attribute: true, grade: 'D' },
);

check(
  'Cloudflare CDN',
  { org: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  { company: 'Cloudflare', tier: 'cdn', attribute: false },
);

check(
  'Vercel PaaS',
  { org: 'Vercel Inc', ptr: ['cname.vercel-dns.com'] },
  { company: 'Vercel', tier: 'cloud_paas', grade: 'A' },
);

console.log('\nAll hosting lookup checks passed.');
