#!/usr/bin/env node
/**
 * Apply barber first-run wizard output (payments + Cal sync).
 *
 *   RAILWAY_API_TOKEN=… npm run apply:barber-setup -- configs/stevendiaz.json
 *   cat setup-payload.json | RAILWAY_API_TOKEN=… npm run apply:barber-setup -- configs/stevendiaz.json -
 *
 * Optional: CALCOM_DATABASE_URL or token-based DB resolve for Cal metadata sync.
 */
import { readFileSync } from 'node:fs';
import { loadBarberConfig, fail } from './barber-config.js';
import { barberPaymentsToSiteEnv } from '../src/lib/barberPayments.ts';
import { parsePaymentsPayload } from '../src/lib/barberSetupWizard.ts';
import { resolveBarberDatabaseUrl } from './barber-cal-db-events.js';
import { syncBarberCalPaymentMode } from './barber-cal-payments.js';
import { upsertRailwayVars, resolveBarberSiteService } from './barber-railway-env.js';

function readPayload(pathArg) {
  if (pathArg === '-') {
    return JSON.parse(readFileSync(0, 'utf8'));
  }
  if (pathArg?.endsWith('.json')) {
    return JSON.parse(readFileSync(pathArg, 'utf8'));
  }
  return null;
}

async function main() {
  const configPath = process.argv[2];
  const payloadPath = process.argv[3];
  if (!configPath) fail('Usage: apply-barber-setup.js <config.json> [payload.json|-]');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const payload = readPayload(payloadPath) ?? {};
  const payments = parsePaymentsPayload(payload.payments) ?? cfg.payments ?? { mode: 'p2p' };

  const siteName = `${cfg.slug}-site`;
  const projectRef = cfg.name;

  if (process.env.RAILWAY_API_TOKEN?.trim()) {
    const { project, env, svc } = await resolveBarberSiteService(projectRef, siteName);
    const siteEnv = {
      ...barberPaymentsToSiteEnv(payments),
      PUBLIC_SHOW_SETUP_BANNER: 'false',
    };
    await upsertRailwayVars(project.id, env.id, svc.id, siteEnv);
    console.log(`[railway] ✓ ${siteName} payment env updated`);
  } else {
    console.log('[railway] skip — no RAILWAY_API_TOKEN (copy vars manually)');
    console.log(barberPaymentsToSiteEnv(payments));
  }

  const dbUrl = await resolveBarberDatabaseUrl(cfg);
  if (dbUrl) {
    const pay = await syncBarberCalPaymentMode(dbUrl, { ...cfg, payments });
    console.log(`[cal-db] ✓ ${pay.mode} on ${pay.updated} event type(s)`);
  } else {
    console.log('[cal-db] skip — set CALCOM_DATABASE_URL or RAILWAY_API_TOKEN');
  }

  console.log('\nDone. Test:', cfg.cal_webapp_url || `https://${cfg.slug}-site-production.up.railway.app/book`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
