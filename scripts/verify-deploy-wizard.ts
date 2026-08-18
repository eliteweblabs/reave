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
  railwayLocalRef,
  railwayRef,
  railwaySharedRef,
  deployWizardDnsKind,
  deployWizardInboundWebhookUrl,
  deployWizardResendFrom,
} from '../src/lib/deployWizardCatalog.ts';
import { generateDeployWizardSecret } from '../src/lib/deployWizardResolve.ts';
import { parseEmailAddress, slugifyCalcomUsername } from '../src/lib/installIdentityFormat.ts';
import {
  featureVisibility,
  isPrivateFeature,
  isPublicFeature,
} from '../src/lib/featureCatalog.ts';

assert.equal(featureVisibility('client_portal'), 'public');
assert.equal(featureVisibility('deploy_wizard'), 'private');
assert.equal(featureVisibility('dev_infra'), 'private');
assert.equal(featureVisibility('code_dev'), 'private');
assert.equal(featureVisibility('namecom_dns'), 'private');
assert.equal(isPublicFeature('client_portal'), true);
assert.equal(isPrivateFeature('deploy_wizard'), true);
assert.equal(isPrivateFeature('dev_infra'), true);
assert.equal(isPrivateFeature('code_dev'), true);
assert.equal(isPrivateFeature('namecom_dns'), true);
assert.equal(isPublicFeature('deploy_wizard'), false);
assert.equal(isPublicFeature('dev_infra'), false);
assert.equal(isPublicFeature('code_dev'), false);
assert.equal(isPublicFeature('namecom_dns'), false);
assert.equal(isPublicFeature('content_management'), true);
assert.equal(isPublicFeature('website'), true);

assert.equal(railwayPublicUrl('contact-api'), 'https://${{ contact-api.RAILWAY_PUBLIC_DOMAIN }}');
assert.equal(railwayPrivateUrl('calcom-booking-api', 8080), 'http://${{ calcom-booking-api.RAILWAY_PRIVATE_DOMAIN }}:8080');
assert.equal(railwaySharedRef('CONTACT_API_CLIENT_KEY'), '${{ shared.CONTACT_API_CLIENT_KEY }}');
assert.equal(railwayRef('reave-postgres', 'DATABASE_URL'), '${{ reave-postgres.DATABASE_URL }}');
assert.equal(railwayLocalRef('EMAIL_FROM_NAME'), '${{EMAIL_FROM_NAME}}');

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
assert.equal(core.postAlias, 'project');
const postAlias = core.variables.find((v) => v.name === 'POST_ALIAS');
assert.equal(postAlias?.filled, 'project');
assert.equal(core.timezone, 'America/New_York');

const branded = buildDeployWizardPlan({
  features: [],
  installSlug: 'capco',
  siteDomain: 'capcofire.com',
  postAlias: 'job',
  companyName: 'Capco Fire',
  adminUsername: 'Pat',
  timezone: 'America/Los_Angeles',
});
assert.equal(branded.variables.find((v) => v.name === 'POST_ALIAS')?.filled, 'job');
assert.equal(branded.variables.find((v) => v.name === 'COMPANY_NAME')?.filled, 'Capco Fire');
assert.equal(branded.variables.find((v) => v.name === 'ADMIN_USERNAME')?.filled, 'Pat');
assert.equal(branded.variables.find((v) => v.name === 'COMPANY_DOMAIN')?.filled, 'capcofire.com');
assert.equal(branded.variables.find((v) => v.name === 'BOOKING_TIMEZONE')?.filled, 'America/Los_Angeles');
assert.equal(branded.variables.find((v) => v.name === 'EMAIL_FROM_NAME')?.filled, 'Capco Fire');
assert.equal(branded.variables.find((v) => v.name === 'EMAIL_FROM_NAME')?.inheritFromHost, false);
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.filled, 'noreply@inbound.capcofire.com');
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.needsInput, false);
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.inheritFromHost, false);
const resendKey = branded.variables.find((v) => v.name === 'RESEND_API_KEY');
assert.equal(resendKey?.inheritFromHost, true);
assert.equal(resendKey?.needsInput, false);
assert.equal(resendKey?.filled, '');
const resendHook = branded.variables.find((v) => v.name === 'RESEND_WEBHOOK_SECRET');
assert.equal(resendHook?.inheritFromHost, false);
assert.equal(resendHook?.provisionedOnApply, true);
assert.equal(branded.variables.find((v) => v.name === 'DASHBOARD_KEY')?.rolledOnApply, true);
assert.ok(branded.variables.every((v) => v.needsInput === false));
assert.equal(deployWizardResendFrom('capcofire.com'), 'noreply@inbound.capcofire.com');
assert.equal(deployWizardInboundWebhookUrl('capcofire.com'), 'https://capcofire.com/api/email/inbound');
assert.match(generateDeployWizardSecret('NEXTAUTH_SECRET'), /^[A-Za-z0-9+/=]+$/);
assert.match(generateDeployWizardSecret('DASHBOARD_KEY'), /^[0-9a-f]{48}$/);
assert.ok((branded.hostSecretCount || 0) > 0);
assert.match(formatDeployWizardCli(branded), /RESEND_API_KEY='<from this host>'/);
assert.match(formatDeployWizardCli(branded), /RESEND_WEBHOOK_SECRET='<created on apply>'/);
assert.match(formatDeployWizardCli(branded), /DASHBOARD_KEY='<rolled on apply>'/);
assert.equal(buildDeployWizardPlan({ features: [], postAlias: 'Disposition(s)' }).postAlias, 'project');

const billed = buildDeployWizardPlan({
  features: ['billing', 'fleet_tracking', 'scheduling'],
  extras: ['materials'],
  siteDomain: 'acme.com',
});
assert.ok(billed.services.some((s) => s.id === 'crater'));
assert.ok(billed.services.some((s) => s.id === 'fleet-api'));
assert.ok(billed.services.some((s) => s.id === 'materials-api'));
assert.ok(billed.variables.some((v) => v.name === 'CRATER_API_BASE_URL' && v.filled.includes('${{ crater.')));
assert.ok(billed.variables.some((v) => v.name === 'BOOKING_API_URL' && v.filled.includes('calcom-booking-api')));
assert.ok(billed.variables.some((v) => v.service === 'shared' && v.name === 'FLEET_API_CLIENT_KEY'));

const reaveEmailFrom = billed.variables.find((v) => v.service === 'reave' && v.name === 'EMAIL_FROM');
assert.equal(reaveEmailFrom?.filled, '${{RESEND_FROM}}');
const calFromName = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'EMAIL_FROM_NAME');
assert.equal(calFromName?.filled, '${{ reave.EMAIL_FROM_NAME }}');
const siteDomain = billed.variables.find((v) => v.service === 'reave' && v.name === 'PUBLIC_SITE_DOMAIN');
assert.equal(siteDomain?.filled, 'acme.com');

const calFrom = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'EMAIL_FROM');
assert.equal(calFrom?.kind, 'reference');
assert.equal(calFrom?.filled, '${{ reave.EMAIL_FROM }}');
const calCompany = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'NEXT_PUBLIC_COMPANY_NAME');
assert.equal(calCompany?.filled, '${{ reave.EMAIL_FROM_NAME }}');
const calSupport = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS');
assert.equal(calSupport?.filled, '${{ reave.EMAIL_FROM }}');
const iconUrl = billed.variables.find((v) => v.service === 'reave' && v.name === 'COMPANY_ICON_URL');
assert.equal(iconUrl?.filled, '${{PUBLIC_SITE_URL}}/api/branding/icon?size=192');
const calUser = billed.variables.find((v) => v.service === 'reave' && v.name === 'CALCOM_USERNAME');
assert.equal(calUser?.kind, 'literal');
assert.equal(calUser?.filled, 'demo');
const calDb = billed.variables.find((v) => v.service === 'reave' && v.name === 'CALCOM_DATABASE_URL');
assert.equal(calDb?.filled, '${{ calcom-postgres.DATABASE_URL }}');

const named = buildDeployWizardPlan({ features: ['scheduling'], installSlug: 'tonybarlettajr' });
const namedUser = named.variables.find((v) => v.service === 'reave' && v.name === 'CALCOM_USERNAME');
assert.equal(namedUser?.filled, 'tonybarlettajr');
assert.equal(slugifyCalcomUsername('Tony Barletta Jr.'), 'tonybarlettajr');
assert.equal(slugifyCalcomUsername('https://tonybarlettajr.com/'), 'tonybarlettajr');
assert.equal(parseEmailAddress('Tony Barletta Jr. <hello@tonybarlettajr.com>'), 'hello@tonybarlettajr.com');
assert.equal(parseEmailAddress('not-an-email'), '');
const calSmtp = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'EMAIL_SERVER_PASSWORD');
assert.equal(calSmtp?.filled, '${{ reave.RESEND_API_KEY }}');
const calResend = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'RESEND_API_KEY');
assert.equal(calResend?.filled, '${{ reave.RESEND_API_KEY }}');

const craterMail = billed.variables.find((v) => v.service === 'crater' && v.name === 'MAIL_PASSWORD');
assert.equal(craterMail?.filled, '${{ reave.RESEND_API_KEY }}');
const contactCors = billed.variables.find((v) => v.service === 'contact-api' && v.name === 'ALLOWED_ORIGINS');
assert.equal(contactCors?.filled, '${{ reave.PUBLIC_SITE_URL }}');

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

const renamed = buildDeployWizardPlan({ features: ['billing', 'scheduling'], appService: 'Astro' });
assert.ok(renamed.services.some((s) => s.id === 'Astro'));
const db = renamed.variables.find((v) => v.service === 'Astro' && v.name === 'DATABASE_URL');
assert.equal(db?.filled, '${{ reave-postgres.DATABASE_URL }}');
const site = renamed.variables.find((v) => v.service === 'Astro' && v.name === 'PUBLIC_SITE_URL');
assert.equal(site?.filled, 'https://${{ Astro.RAILWAY_PUBLIC_DOMAIN }}');
const renamedCalFrom = renamed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'EMAIL_FROM');
assert.equal(renamedCalFrom?.filled, '${{ Astro.EMAIL_FROM }}');

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
assert.equal(deployWizardDnsKind(billedDns.domains.find((d) => d.host === 'book')!), 'skip');
assert.equal(deployWizardDnsKind(billedDns.domains.find((d) => d.host === 'cal')!), 'railway');
assert.equal(deployWizardDnsKind(billedDns.domains.find((d) => d.host === 'inbound')!), 'resend');
assert.equal(deployWizardDnsKind(billedDns.domains.find((d) => d.host === 'clerk')!), 'clerk');

const cli = formatDeployWizardCli(billedDns);
assert.match(cli, /CNAME\s+ap\s+ap\.acme\.com/);
assert.match(cli, /MX\s+inbound/);
assert.match(cli, /railway variable set CONTACT_API_BASE_URL=/);
assert.match(cli, /--service reave/);
assert.match(cli, /--skip-deploys/);

console.log('verify-deploy-wizard: ok');
