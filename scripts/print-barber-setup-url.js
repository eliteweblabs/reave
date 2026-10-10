#!/usr/bin/env node
/**
 * Print first-run setup wizard URL (needs SETUP_WIZARD_SECRET on site service or pass --secret).
 *
 *   npm run barber:setup-url -- configs/stevendiaz.json
 */
import { loadBarberConfig, fail } from './barber-config.js';
import { barberAdminUrl, barberSetupWizardUrl } from '../src/lib/barberSetupWizard.ts';
import { railwayGql, resolveBarberCalService } from './barber-cal-railway.js';

async function readSiteSecret(cfg) {
  const fromEnv = process.env.SETUP_WIZARD_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (!process.env.RAILWAY_API_TOKEN?.trim()) return null;
  const siteName = `${cfg.slug}-site`;
  const { project, env, svc } = await resolveBarberCalService(cfg.name, siteName);
  const data = await railwayGql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId: project.id, environmentId: env.id, serviceId: svc.id },
  );
  return data.variables?.SETUP_WIZARD_SECRET?.trim() || null;
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: print-barber-setup-url.js <config.json>');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const secretArg = process.argv.find((a) => a.startsWith('--secret='))?.slice('--secret='.length);
  const secret = secretArg || (await readSiteSecret(cfg));
  if (!secret) {
    fail('No SETUP_WIZARD_SECRET — redeploy with provision or set on Railway site service.');
  }

  const site =
    cfg.site_webapp_url?.trim() ||
    `https://${cfg.slug}-site-production.up.railway.app`;
  console.log('Setup wizard:', barberSetupWizardUrl(site, secret));
  console.log('Owner admin: ', barberAdminUrl(site, secret));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
