/**
 * Guard: deploy wizard reference templates stay on canonical service names.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-deploy-wizard.ts
 */
import assert from 'node:assert/strict';
import {
  buildDeployWizardPlan,
  DEPLOY_APP_SERVICE,
  DEPLOY_WIZARD_NEW_PROJECT,
  deployWizardDesiredProjectName,
  deployWizardFqdn,
  formatDeployWizardCli,
  isDeployWizardNewProjectRef,
  isDeployWizardSeedIndustryId,
  mergeDeployWizardSeedIndustries,
  defaultAdminUsernameFromOwner,
  normalizeDeployWizardEmail,
  normalizeDeployWizardPersonName,
  normalizeDeployWizardPhone,
  normalizeSiteDomain,
  isDeployWizardPublicHost,
  deployWizardSiteOrigin,
  railwayPrivateUrl,
  railwayPublicUrl,
  railwayLocalRef,
  railwayRef,
  railwaySharedRef,
  deployWizardDnsKind,
  deployWizardInboundWebhookUrl,
  deployWizardResendFrom,
} from '../src/lib/deployWizardCatalog.ts';
import { isActiveRailwayProject } from '../src/lib/railwayProjectList.ts';
import { anthropicKeySourceForApply, generateDeployWizardSecret } from '../src/lib/deployWizardResolve.ts';
import { buildGithubAppManifest, githubAppInstallUrl, githubAppManifestName, publicGithubAppOrigin } from '../src/lib/deployWizardGithubApp.ts';
import { CSP_FORM_ACTION } from '../src/lib/securityHeaders.ts';
import { parseEmailAddress, slugifyCalcomUsername } from '../src/lib/installIdentityFormat.ts';
import {
  applyIndustryPlaybookToWizard,
  backfillCanonicalDeployIndustries,
  defaultFixturePlaybook,
  EMPTY_INDUSTRY_PLAYBOOK,
  normalizeIndustryPlaybook,
} from '../src/lib/industryPlaybook.ts';
import { DEMO_BASELINE_MODULE_IDS, demoModuleIdForFeature } from '../src/lib/demoModuleCatalog.ts';
import {
  featureVisibility,
  isDeployableFeature,
  isPrivateFeature,
  isPublicFeature,
  isServiceFeature,
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
assert.equal(featureVisibility('google_workspace'), 'service');
assert.equal(isServiceFeature('google_workspace'), true);
assert.equal(isPublicFeature('google_workspace'), false);
assert.equal(isDeployableFeature('google_workspace'), false);
assert.equal(featureVisibility('hosting_core_os'), 'service');
assert.equal(isServiceFeature('hosting_core_os'), true);
assert.equal(isServiceFeature('hosting_growth'), true);
assert.equal(isPublicFeature('hosting_growth'), false);
assert.equal(isDeployableFeature('hosting_core_os'), false);
assert.equal(isDeployableFeature('hosting_growth'), false);

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
assert.equal(core.variables.find((v) => v.name === 'FEATURES')?.filled, '[]');
assert.equal(core.postAlias, 'project');
assert.ok(
  core.variables.some((v) => v.name === 'VAPI_API_KEY' && v.inheritFromHost),
  'public host secrets copy even when the module was not selected',
);
assert.ok(
  core.variables.some((v) => v.name === 'PEXELS_API_KEY' && v.inheritFromHost),
  'Pexels copies from this host without stock_photos selected',
);
assert.ok(
  !core.variables.some((v) => v.name === 'RAILWAY_API_TOKEN'),
  'private ops tokens stay gated on dev_infra',
);
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
assert.equal(normalizeDeployWizardEmail(' Jane.Doe@Acme.com '), 'jane.doe@acme.com');
assert.equal(normalizeDeployWizardEmail('not-an-email'), '');
assert.equal(normalizeDeployWizardPersonName('  Jane   Q  '), 'Jane Q');
assert.equal(normalizeDeployWizardPhone('(555) 000-0000'), '+15550000000');
assert.equal(
  defaultAdminUsernameFromOwner({ firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.com' }),
  'Jane, Doe, Jane Doe, jane@acme.com',
);

assert.equal(branded.variables.find((v) => v.name === 'POST_ALIAS')?.filled, 'job');
assert.equal(branded.variables.find((v) => v.name === 'COMPANY_NAME')?.filled, 'Capco Fire');
assert.equal(branded.variables.find((v) => v.name === 'ADMIN_USERNAME')?.filled, 'Pat');
assert.equal(branded.variables.find((v) => v.name === 'COMPANY_DOMAIN')?.filled, 'capcofire.com');
assert.equal(branded.variables.find((v) => v.name === 'BOOKING_TIMEZONE')?.filled, 'America/Los_Angeles');
const ownerPlan = buildDeployWizardPlan({
  features: [],
  installSlug: 'capco',
  siteDomain: 'capcofire.com',
  companyName: 'Capco Fire',
  ownerFirstName: 'Jane',
  ownerLastName: 'Doe',
  ownerEmail: 'jane@capcofire.com',
  ownerPhone: '(781) 555-0100',
  timezone: 'America/Los_Angeles',
});
assert.equal(ownerPlan.ownerFirstName, 'Jane');
assert.equal(ownerPlan.ownerLastName, 'Doe');
assert.equal(ownerPlan.ownerEmail, 'jane@capcofire.com');
assert.equal(ownerPlan.ownerPhone, '+17815550100');
assert.equal(ownerPlan.adminUsername, 'Jane, Doe, Jane Doe, jane@capcofire.com');
assert.equal(ownerPlan.variables.find((v) => v.name === 'OWNER_FIRST_NAME')?.filled, 'Jane');
assert.equal(ownerPlan.variables.find((v) => v.name === 'OWNER_LAST_NAME')?.filled, 'Doe');
assert.equal(ownerPlan.variables.find((v) => v.name === 'OWNER_EMAIL')?.filled, 'jane@capcofire.com');
assert.equal(ownerPlan.variables.find((v) => v.name === 'OWNER_PHONE')?.filled, '+17815550100');
assert.equal(ownerPlan.variables.find((v) => v.name === 'VAPID_SUBJECT')?.filled, 'mailto:jane@capcofire.com');
assert.equal(ownerPlan.variables.find((v) => v.name === 'ADMIN_USERNAME')?.filled, ownerPlan.adminUsername);

assert.equal(branded.variables.find((v) => v.name === 'EMAIL_FROM_NAME')?.filled, 'Capco Fire');
assert.equal(branded.variables.find((v) => v.name === 'EMAIL_FROM_NAME')?.inheritFromHost, false);
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.filled, 'noreply@inbound.capcofire.com');
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.needsInput, false);
assert.equal(branded.variables.find((v) => v.name === 'RESEND_FROM')?.inheritFromHost, false);
const resendKey = branded.variables.find((v) => v.name === 'RESEND_API_KEY');
assert.equal(resendKey?.inheritFromHost, true);
assert.equal(resendKey?.needsInput, false);
assert.equal(resendKey?.required, false);
assert.equal(resendKey?.filled, '');
const resendHook = branded.variables.find((v) => v.name === 'RESEND_WEBHOOK_SECRET');
assert.equal(resendHook?.inheritFromHost, false);
assert.equal(resendHook?.provisionedOnApply, true);
assert.equal(branded.variables.find((v) => v.name === 'DASHBOARD_KEY')?.rolledOnApply, true);
assert.ok(
  branded.variables
    .filter((v) => v.name !== 'ANTHROPIC_API_KEY')
    .every((v) => v.needsInput === false),
);
assert.equal(deployWizardResendFrom('capcofire.com'), 'noreply@inbound.capcofire.com');
assert.equal(deployWizardInboundWebhookUrl('capcofire.com'), 'https://capcofire.com/api/email/inbound');
assert.match(generateDeployWizardSecret('NEXTAUTH_SECRET'), /^[A-Za-z0-9+/=]+$/);
assert.match(generateDeployWizardSecret('CALENDSO_ENCRYPTION_KEY'), /^[A-Za-z0-9+/=]+$/);
assert.match(generateDeployWizardSecret('DASHBOARD_KEY'), /^[0-9a-f]{48}$/);
assert.ok((branded.hostSecretCount || 0) > 0);
assert.match(formatDeployWizardCli(branded), /RESEND_API_KEY='<from this host>'/);
assert.match(formatDeployWizardCli(branded), /RESEND_WEBHOOK_SECRET='<created on apply>'/);
assert.match(formatDeployWizardCli(branded), /DASHBOARD_KEY='<rolled on apply>'/);
assert.equal(buildDeployWizardPlan({ features: [], postAlias: 'Disposition(s)' }).postAlias, 'project');

const billed = buildDeployWizardPlan({
  features: ['billing', 'fleet_tracking', 'scheduling', 'materials_pricing'],
  siteDomain: 'acme.com',
});
assert.ok(billed.services.some((s) => s.id === 'crater'));
assert.equal(billed.services.find((s) => s.id === 'calcom-booking-api')?.repo, 'eliteweblabs/calcom-booking-api');
assert.equal(
  billed.services.find((s) => s.id === 'calcom-web-app')?.image,
  'calcom/cal.com@sha256:ace3bb1219fb7306585ab9f4d94d41af7ee064c343db0498173436bbe857bd49',
);
assert.ok(billed.services.some((s) => s.id === 'fleet-api'));
assert.ok(billed.services.some((s) => s.id === 'materials-api'));

const legacyMaterials = buildDeployWizardPlan({
  features: ['billing'],
  extras: ['materials' as never],
});
assert.ok(legacyMaterials.services.some((s) => s.id === 'materials-api'));
assert.ok(legacyMaterials.features.includes('materials_pricing'));
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
const logoUrl = billed.variables.find((v) => v.service === 'reave' && v.name === 'COMPANY_LOGO_URL');
assert.equal(logoUrl?.filled, '${{PUBLIC_SITE_URL}}/branding/logo.png');
const craterLogo = billed.variables.find((v) => v.service === 'crater' && v.name === 'COMPANY_LOGO_URL');
assert.equal(craterLogo?.filled, '${{ reave.COMPANY_LOGO_URL }}');
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
const calEnc = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'CALENDSO_ENCRYPTION_KEY');
assert.equal(calEnc?.kind, 'generated');
assert.ok(!billed.variables.some((v) => v.service === 'calcom-web-app' && v.name === 'CALENDAR_ENCRYPTION_KEY'));
const calHosts = billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'ALLOWED_HOSTNAMES');
assert.match(calHosts?.filled || '', /RAILWAY_PUBLIC_DOMAIN/);
assert.equal(billed.variables.find((v) => v.service === 'calcom-web-app' && v.name === 'NEXT_PUBLIC_LICENSE_CONSENT')?.filled, 'agree');

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
assert.equal(isDeployWizardPublicHost('app.levineslaw.com'), true);
assert.equal(isDeployWizardPublicHost('https://app.levineslaw.com/'), true);
assert.equal(isDeployWizardPublicHost('localhost'), false);
assert.equal(isDeployWizardPublicHost('not a host'), false);
assert.equal(deployWizardSiteOrigin('app.levineslaw.com'), 'https://app.levineslaw.com');
assert.equal(deployWizardSiteOrigin('localhost'), '');
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

const websitePlan = buildDeployWizardPlan({
  features: ['website'],
  installSlug: 'tonybarlettajr',
});
const websiteRepoVar = websitePlan.variables.find((v) => v.name === 'GITHUB_WEBSITE_REPO');
assert.equal(websiteRepoVar?.filled, 'eliteweblabs/tonybarlettajr-site');
const websiteToken = websitePlan.variables.find((v) => v.name === 'GITHUB_TOKEN');
assert.equal(websiteToken?.inheritFromHost, false, 'client GITHUB_TOKEN must not copy the reΛVe.app host PAT');
assert.equal(websiteToken?.required, false);
assert.equal(websitePlan.variables.find((v) => v.name === 'GITHUB_APP_PRIVATE_KEY')?.inheritFromHost, false);
assert.equal(websitePlan.variables.find((v) => v.name === 'GITHUB_APP_ID')?.inheritFromHost, false);
assert.equal(websitePlan.variables.find((v) => v.name === 'GITHUB_APP_PRIVATE_KEY')?.provisionedOnApply, true);
assert.equal(websitePlan.variables.find((v) => v.name === 'GITHUB_APP_ID')?.provisionedOnApply, true);
assert.equal(websitePlan.variables.find((v) => v.name === 'GITHUB_APP_INSTALLATION_ID')?.provisionedOnApply, true);

const coreSecrets = buildDeployWizardPlan({ features: ['website'] });
const anthropicSecret = coreSecrets.variables.find((v) => v.name === 'ANTHROPIC_API_KEY');
assert.equal(anthropicSecret?.required, false);
assert.equal(anthropicSecret?.needsInput, true);
assert.equal(coreSecrets.variables.find((v) => v.name === 'RESEND_API_KEY')?.required, false);
assert.equal(coreSecrets.variables.find((v) => v.name === 'RESEND_API_KEY')?.needsInput, false);
const clerkSecretVars = coreSecrets.variables.filter((v) => v.name === 'CLERK_SECRET_KEY');
assert.equal(clerkSecretVars.length, 2, 'Clerk secret is written on shared and the app service');
assert.deepEqual(
  clerkSecretVars.map((v) => v.service).sort(),
  [DEPLOY_APP_SERVICE, 'shared'].sort(),
);
assert.ok(clerkSecretVars.every((v) => v.required === false));
assert.ok(clerkSecretVars.every((v) => v.inheritFromHost === true), 'Clerk keys copy from this host when present');
const clerkPublishableVars = coreSecrets.variables.filter((v) => v.name === 'PUBLIC_CLERK_PUBLISHABLE_KEY');
assert.equal(clerkPublishableVars.length, 2);
assert.ok(clerkPublishableVars.every((v) => v.inheritFromHost === true));
assert.equal(anthropicKeySourceForApply('', 'sk-ant-host'), 'reave');
assert.equal(anthropicKeySourceForApply('sk-ant-client', 'sk-ant-host'), 'client');
assert.equal(anthropicKeySourceForApply('', ''), '');

const lawSeed = buildDeployWizardPlan({
  features: ['website'],
  seed: { industry: 'law', inbox: true, todos: true, schedule: true },
});
assert.equal(lawSeed.seed.industry, 'law');
assert.equal(isDeployWizardSeedIndustryId('salon'), true);
assert.equal(isDeployWizardSeedIndustryId('not a slug!!!'), false);
assert.equal(isDeployWizardSeedIndustryId('none'), true);
const catalogPicker = mergeDeployWizardSeedIndustries([
  { slug: 'salon', label: 'Salon' },
  { slug: 'real-estate', label: 'Real estate' },
  { slug: 'law', label: 'Law firm', enabled: false },
]);
assert.deepEqual(
  catalogPicker.map((row) => row.id),
  ['none', 'general', 'plumbing', 'real-estate', 'salon'],
);
const emptyCatalogPicker = mergeDeployWizardSeedIndustries([]);
assert.deepEqual(
  emptyCatalogPicker.map((row) => row.id),
  ['none', 'general', 'law', 'plumbing'],
);
assert.equal(emptyCatalogPicker.find((row) => row.id === 'law')?.playbook.postAlias, 'matter');
const salonPlaybook = mergeDeployWizardSeedIndustries([
  {
    slug: 'salon',
    label: 'Salon',
    playbook: { moduleIds: ['006', '009'], extras: ['materials'], notes: 'Book + voice', postAlias: 'client' },
  },
]).find((row) => row.id === 'salon');
const salonIds = [
  demoModuleIdForFeature('analytic_audit'),
  demoModuleIdForFeature('documents'),
  demoModuleIdForFeature('materials_pricing'),
].sort();
assert.deepEqual(salonPlaybook?.playbook.moduleIds, salonIds);
assert.deepEqual(salonPlaybook?.playbook.extras, []);
assert.equal(salonPlaybook?.playbook.postAlias, 'client');
const applied = applyIndustryPlaybookToWizard({
  industryId: 'salon',
  playbook: salonPlaybook?.playbook,
  allowedModuleIds: new Set([...DEMO_BASELINE_MODULE_IDS, ...salonIds]),
  baselineModuleIds: [...DEMO_BASELINE_MODULE_IDS],
  currentModuleIds: [...DEMO_BASELINE_MODULE_IDS],
  currentExtras: [],
  currentPostAlias: 'project',
});
assert.deepEqual(applied.moduleIds, [...DEMO_BASELINE_MODULE_IDS, ...salonIds].sort());
assert.deepEqual(applied.extras, []);
assert.equal(applied.postAlias, 'client');
const lawCurrent = [
  ...DEMO_BASELINE_MODULE_IDS,
  demoModuleIdForFeature('billing'),
  demoModuleIdForFeature('documents'),
  demoModuleIdForFeature('vapi'),
  demoModuleIdForFeature('scheduling'),
].sort();
const lawKept = applyIndustryPlaybookToWizard({
  industryId: 'law',
  playbook: defaultFixturePlaybook('law'),
  allowedModuleIds: new Set(lawCurrent),
  baselineModuleIds: [...DEMO_BASELINE_MODULE_IDS],
  currentModuleIds: lawCurrent,
  currentExtras: ['plausible_railway'],
  currentPostAlias: 'project',
});
assert.deepEqual(lawKept.moduleIds, lawCurrent);
assert.deepEqual(lawKept.extras, ['plausible_railway']);
assert.equal(lawKept.postAlias, 'matter');
const vapiPlan = buildDeployWizardPlan({ features: ['vapi'], installSlug: 'levineslaw' });
assert.equal(vapiPlan.variables.find((v) => v.name === 'FEATURES')?.filled, '["vapi"]');
const signaturePlan = buildDeployWizardPlan({ features: ['digital_signature'] });
assert.ok(signaturePlan.features.includes('digital_signature'));
assert.ok(signaturePlan.features.includes('documents'));
assert.match(signaturePlan.variables.find((v) => v.name === 'FEATURES')?.filled || '', /documents/);
const signaturePlaybook = normalizeIndustryPlaybook({
  moduleIds: [demoModuleIdForFeature('digital_signature')],
});
assert.ok(signaturePlaybook.moduleIds.includes(demoModuleIdForFeature('digital_signature')));
assert.ok(signaturePlaybook.moduleIds.includes(demoModuleIdForFeature('documents')));
const socialPlan = buildDeployWizardPlan({ features: ['social_inbox'] });
assert.ok(socialPlan.variables.some((v) => v.name === 'INSTAGRAM_APP_ID' && v.inheritFromHost));
assert.ok(socialPlan.variables.some((v) => v.name === 'INSTAGRAM_APP_SECRET' && v.inheritFromHost));
assert.ok(
  core.variables.some((v) => v.name === 'INSTAGRAM_APP_ID' && v.inheritFromHost),
  'public-module Instagram keys still copy when social_inbox is not selected',
);
assert.equal(
  normalizeIndustryPlaybook({ moduleIds: ['1', '006', '006'] }).moduleIds.join(','),
  demoModuleIdForFeature('analytic_audit'),
);
const backfilled = backfillCanonicalDeployIndustries([
  {
    id: 1,
    slug: 'salon',
    label: 'Salon',
    sortOrder: 0,
    enabled: true,
    playbook: { ...EMPTY_INDUSTRY_PLAYBOOK },
    updatedAt: null,
  },
  {
    id: 2,
    slug: 'plumbers',
    label: 'Plumbers',
    sortOrder: 1,
    enabled: true,
    playbook: { ...EMPTY_INDUSTRY_PLAYBOOK },
    updatedAt: null,
  },
]);
assert.equal(backfilled.changed, true);
assert.deepEqual(
  backfilled.list.map((row) => row.slug),
  ['general', 'law', 'plumbing', 'salon'],
);
assert.equal(backfilled.list.find((row) => row.slug === 'plumbing')?.label, 'Plumbing');
assert.match(backfilled.list.find((row) => row.slug === 'plumbing')?.playbook.notes || '', /trade shop/);
assert.equal(backfilled.list.find((row) => row.slug === 'law')?.playbook.postAlias, 'matter');
assert.equal(
  backfillCanonicalDeployIndustries(backfilled.list).changed,
  false,
);
const salonSeed = buildDeployWizardPlan({
  features: ['website'],
  seed: { industry: 'salon', inbox: true, todos: true, schedule: true },
});
assert.equal(salonSeed.seed.industry, 'salon');
assert.equal(salonSeed.variables.find((v) => v.name === 'DEMO_INDUSTRY')?.filled, 'salon');
assert.equal(salonSeed.variables.find((v) => v.name === 'COURT_GATE_MODE'), undefined);
assert.equal(lawSeed.variables.find((v) => v.name === 'RESEND_API_KEY')?.required, false);
assert.equal(lawSeed.variables.find((v) => v.name === 'DEMO_INDUSTRY')?.filled, 'law');
assert.equal(lawSeed.variables.find((v) => v.name === 'SEED_ON_BOOT')?.filled, '1');
assert.equal(lawSeed.variables.find((v) => v.name === 'SEED_INBOX')?.filled, '1');
assert.equal(lawSeed.postAlias, 'matter');
assert.equal(lawSeed.variables.find((v) => v.name === 'POST_ALIAS')?.filled, 'matter');
assert.equal(lawSeed.variables.find((v) => v.name === 'COURT_RADIUS_MI')?.filled, '60');
assert.equal(lawSeed.variables.find((v) => v.name === 'PRACTICE_AREA')?.filled, 'bankruptcy');
assert.equal(lawSeed.variables.find((v) => v.name === 'COURT_GATE_MODE')?.filled, 'radius');
assert.equal(lawSeed.variables.find((v) => v.name === 'BOOKING_DEFAULT_ADDRESS'), undefined);
const lawPin = buildDeployWizardPlan({
  features: ['website'],
  seed: {
    industry: 'law',
    inbox: true,
    todos: true,
    schedule: true,
    practiceAddress: '123 Cabot St, Beverly, MA 01915',
    courtGateMode: 'counties',
    courtRadiusMi: 60,
    courtCounties: ['Essex', 'Middlesex'],
    practiceAreas: ['bankruptcy', 'tax'],
  },
});
assert.equal(lawPin.variables.find((v) => v.name === 'BOOKING_DEFAULT_ADDRESS')?.filled, '123 Cabot St, Beverly, MA 01915');
assert.equal(lawPin.variables.find((v) => v.name === 'COURT_COUNTIES')?.filled, 'Essex,Middlesex');
assert.equal(lawPin.variables.find((v) => v.name === 'PRACTICE_AREA')?.filled, 'bankruptcy,tax');
assert.equal(lawPin.variables.find((v) => v.name === 'COURT_GATE_MODE')?.filled, 'counties');
const lawState = buildDeployWizardPlan({
  features: ['website'],
  seed: {
    industry: 'law',
    inbox: true,
    todos: true,
    schedule: true,
    courtGateMode: 'state',
    courtStates: ['MA', 'NH'],
    practiceAreas: ['foreclosure', 'general'],
  },
});
assert.equal(lawState.variables.find((v) => v.name === 'COURT_GATE_MODE')?.filled, 'state');
assert.equal(lawState.variables.find((v) => v.name === 'COURT_STATES')?.filled, 'MA,NH');
assert.equal(lawState.variables.find((v) => v.name === 'PRACTICE_AREA')?.filled, 'foreclosure,general');
assert.equal(lawState.variables.find((v) => v.name === 'COURT_RADIUS_MI'), undefined);
assert.equal(githubAppManifestName('TonyBarlettaJr'), 'reave-tonybarlettajr');
const manifest = buildGithubAppManifest({
  installSlug: 'tonybarlettajr',
  origin: 'https://reave.app',
  siteDomain: 'tony.com',
  state: 'abc',
});
assert.equal(manifest.name, 'reave-tonybarlettajr');
assert.equal((manifest.default_permissions as { contents?: string }).contents, 'write');
assert.equal(manifest.redirect_url, 'https://reave.app/api/deploy/wizard/github-app');
assert.equal(manifest.setup_url, 'https://reave.app/api/deploy/wizard/github-app');
assert.match(githubAppInstallUrl('reave-barry', { targetId: 123 }), /target_id=123/);
assert.equal(publicGithubAppOrigin('http://localhost:8080'), 'https://reave.app');
assert.equal(
  buildGithubAppManifest({
    installSlug: 'demo',
    origin: 'http://127.0.0.1:8080',
    state: 'abc',
  }).redirect_url,
  'https://reave.app/api/deploy/wizard/github-app',
);
assert.equal(manifest.public, false);
assert.match(CSP_FORM_ACTION, /https:\/\/github\.com/);

const cli = formatDeployWizardCli(billedDns);
assert.match(cli, /CNAME\s+ap\s+ap\.acme\.com/);
assert.match(cli, /MX\s+inbound/);
assert.match(cli, /railway variable set CONTACT_API_BASE_URL=/);
assert.match(cli, /--service reave/);
assert.match(cli, /--skip-deploys/);

assert.equal(isActiveRailwayProject({ id: '1', name: 'The Barbers Edge' }), true);
assert.equal(isActiveRailwayProject({ id: '1', name: 'gone', deletedAt: '2026-01-01T00:00:00Z' }), false);
assert.equal(isActiveRailwayProject({ id: '1', name: 'expired', expiredAt: '2026-01-01T00:00:00Z' }), false);
assert.equal(isActiveRailwayProject({ id: '1', name: 'helpful-imagination', isTempProject: true }), false);

assert.equal(isDeployWizardNewProjectRef(''), true);
assert.equal(isDeployWizardNewProjectRef(DEPLOY_WIZARD_NEW_PROJECT), true);
assert.equal(isDeployWizardNewProjectRef('loveandever'), false);
assert.equal(deployWizardDesiredProjectName({ projectName: 'Barry Levine' }), 'Barry Levine');
assert.equal(deployWizardDesiredProjectName({ companyName: 'Levine Law', installSlug: 'barry-levine' }), 'Levine Law');
assert.equal(deployWizardDesiredProjectName({ installSlug: 'barry-levine' }), 'barry levine');
assert.ok(core.services.find((s) => s.id === 'reave-postgres')?.image);
assert.ok(core.services.find((s) => s.id === 'reave-postgres')?.volumeMount);
assert.ok(core.services.find((s) => s.id === 'reave')?.repo);

console.log('verify-deploy-wizard: ok');
