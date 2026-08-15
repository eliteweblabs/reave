/**
 * Guard: deploy wizard reference templates stay on canonical service names.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-deploy-wizard.ts
 */
import assert from 'node:assert/strict';
import {
  buildDeployWizardPlan,
  deployWizardFqdn,
  formatDeployWizardCli,
  normalizeSiteDomain,
  railwayPrivateUrl,
  railwayPublicUrl,
  railwayRef,
  railwaySharedRef,
} from '../src/lib/deployWizardCatalog.ts';

assert.equal(railwayPublicUrl('contact-api'), 'https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}');
assert.equal(railwayPrivateUrl('calcom-booking-api', 8080), 'http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080');
assert.equal(railwaySharedRef('CONTACT_API_CLIENT_KEY'), '${{ shared.CONTACT_API_CLIENT_KEY }}');
assert.equal(railwayRef('reave-postgres', 'DATABASE_URL'), '${{ reave-postgres.DATABASE_URL }}');

const core = buildDeployWizardPlan({ features: [], installSlug: 'acme' });
assert.equal(core.installSlug, 'acme');
assert.ok(core.services.some((s) => s.id === 'reave'));
assert.ok(core.services.some((s) => s.id === 'contact-api'));
assert.ok(!core.services.some((s) => s.id === 'crater'));

const contactUrl = core.variables.find((v) => v.service === 'reave' && v.name === 'CONTACT_API_BASE_URL');
assert.equal(contactUrl?.kind, 'reference');
assert.equal(contactUrl?.filled, 'https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}');

const install = core.variables.find((v) => v.name === 'INSTALL_CONFIG');
assert.equal(install?.filled, 'acme');

const billed = buildDeployWizardPlan({
  features: ['billing', 'fleet_tracking', 'scheduling'],
  extras: ['materials'],
});
assert.ok(billed.services.some((s) => s.id === 'crater'));
assert.ok(billed.services.some((s) => s.id === 'fleet-api'));
assert.ok(billed.services.some((s) => s.id === 'materials-api'));
assert.ok(billed.variables.some((v) => v.name === 'CRATER_API_BASE_URL' && v.filled.includes('${{ crater.')));
assert.ok(billed.variables.some((v) => v.name === 'BOOKING_API_URL' && v.filled.includes('calcom-booking-api')));
assert.ok(billed.variables.some((v) => v.service === 'shared' && v.name === 'FLEET_API_CLIENT_KEY'));

const saasMonitor = buildDeployWizardPlan({ features: ['site_monitoring'] });
const saasUrl = saasMonitor.variables.find((v) => v.name === 'CHANGEDETECTION_BASE_URL');
assert.equal(saasUrl?.kind, 'secret');

const ignoredExtra = buildDeployWizardPlan({
  features: ['billing'],
  extras: ['changedetection_railway'],
});
assert.ok(!ignoredExtra.services.some((s) => s.id === 'changedetection'));

const hostedMonitor = buildDeployWizardPlan({
  features: ['site_monitoring'],
  extras: ['changedetection_railway'],
});
const hostedUrl = hostedMonitor.variables.find((v) => v.name === 'CHANGEDETECTION_BASE_URL');
assert.equal(hostedUrl?.kind, 'reference');
assert.equal(hostedUrl?.filled, 'https://${{ changedetection.RAILWAY_PUBLIC_DOMAIN }}');

const renamed = buildDeployWizardPlan({ features: ['billing'], appService: 'Astro' });
assert.ok(renamed.services.some((s) => s.id === 'Astro'));
const db = renamed.variables.find((v) => v.service === 'Astro' && v.name === 'DATABASE_URL');
assert.equal(db?.filled, '${{ reave-postgres.DATABASE_URL }}');
const site = renamed.variables.find((v) => v.service === 'Astro' && v.name === 'PUBLIC_SITE_URL');
assert.equal(site?.filled, 'https://${{ Astro.RAILWAY_PUBLIC_DOMAIN }}');

assert.equal(normalizeSiteDomain('https://www.Acme.com/'), 'acme.com');
assert.equal(deployWizardFqdn('ap', 'acme.com'), 'ap.acme.com');
assert.equal(deployWizardFqdn('@', ''), '{apex}');

const coreHosts = core.domains.map((d) => d.host);
assert.ok(coreHosts.includes('@'));
assert.ok(coreHosts.includes('inbound'));
assert.ok(coreHosts.includes('clerk'));
assert.ok(!coreHosts.includes('ap'));
assert.ok(!coreHosts.includes('cal'));

const billedDns = buildDeployWizardPlan({
  features: ['billing', 'scheduling'],
  siteDomain: 'https://www.acme.com',
});
assert.ok(billedDns.domains.some((d) => d.host === 'ap' && d.fqdn === 'ap.acme.com' && d.target === 'crater'));
assert.ok(billedDns.domains.some((d) => d.host === 'cal' && d.fqdn === 'cal.acme.com'));
assert.ok(billedDns.domains.some((d) => d.host === 'book' && d.target === 'calcom-booking-api'));
assert.ok(!billedDns.domains.some((d) => d.host === 'demo'));

const cli = formatDeployWizardCli(billedDns);
assert.match(cli, /CNAME\s+ap\s+ap\.acme\.com/);
assert.match(cli, /MX\s+inbound/);
assert.match(cli, /railway variable set CONTACT_API_BASE_URL=/);
assert.match(cli, /--service reave/);
assert.match(cli, /--skip-deploys/);

console.log('verify-deploy-wizard: ok');
