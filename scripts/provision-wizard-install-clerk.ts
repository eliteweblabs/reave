/**
 * One-shot: create Clerk keys for a wizard install missing PUBLIC_CLERK_* / CLERK_SECRET_*.
 * Run on rekko.studio (needs CLERK_PLATFORM_KEY) with Railway linked to the client project:
 *
 *   railway link -p <projectId> -e production -s pups
 *   railway run -- npx tsx scripts/provision-wizard-install-clerk.ts
 */
import { provisionDeployWizardClerkKeys } from '../src/lib/deployWizardClerk.ts';
import { buildDeployWizardPlan } from '../src/lib/deployWizardCatalog.ts';
import { railwayListVariables, railwaySetVariables } from '../src/lib/railwayAgentApi.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

const project = serverEnv('RAILWAY_PROJECT_ID')?.trim();
const service = serverEnv('RAILWAY_SERVICE_NAME')?.trim() || 'reave';
const environment = serverEnv('RAILWAY_ENVIRONMENT_NAME')?.trim() || 'production';

if (!project) {
  console.error('Link a Railway project first (RAILWAY_PROJECT_ID missing).');
  process.exit(1);
}

const vars = await railwayListVariables({ project, environment, service });
if (!vars.ok) {
  console.error(vars.error);
  process.exit(1);
}

const installSlug = (vars.variables.INSTALL_CONFIG ?? service).trim() || 'demo';
const plan = buildDeployWizardPlan({
  features: [],
  installSlug,
  appService: service,
  siteDomain: vars.variables.PUBLIC_SITE_DOMAIN ?? vars.variables.RAILWAY_PUBLIC_DOMAIN ?? '',
  companyName: vars.variables.COMPANY_NAME ?? installSlug,
});

const patched = { ...plan, stagingHost: true };
const provision = await provisionDeployWizardClerkKeys({ plan: patched, values: {} });
if (!provision.ok) {
  console.error(provision.error);
  process.exit(1);
}
if (!provision.created) {
  console.log('Clerk keys already present in the apply plan — nothing to do.');
  process.exit(0);
}

const pk = provision.values[`${service}:PUBLIC_CLERK_PUBLISHABLE_KEY`];
const sk = provision.values[`${service}:CLERK_SECRET_KEY`];
if (!pk || !sk) {
  console.error('Provision succeeded but keys were empty.');
  process.exit(1);
}

const shared = await railwaySetVariables({
  project,
  environment,
  variables: {
    PUBLIC_CLERK_PUBLISHABLE_KEY: pk,
    CLERK_SECRET_KEY: sk,
  },
  skip_deploys: true,
});
if (!shared.ok) {
  console.error(shared.error);
  process.exit(1);
}

const app = await railwaySetVariables({
  project,
  environment,
  service,
  variables: {
    PUBLIC_CLERK_PUBLISHABLE_KEY: pk,
    CLERK_SECRET_KEY: sk,
  },
  skip_deploys: false,
});
if (!app.ok) {
  console.error(app.error);
  process.exit(1);
}

for (const note of provision.notes) console.log(note);
console.log('Clerk keys written — redeploy triggered on', service);
