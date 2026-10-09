#!/usr/bin/env node
/**
 * Turn on Cal.com Stripe pay-on-booking for each priced service in configs/*.json.
 *
 *   npm run enable:barber-payments -- configs/stevendiaz.json
 *
 * Requires Cal Postgres (RAILWAY_API_TOKEN or CALCOM_DATABASE_URL). Stripe keys on
 * stevendiaz-cal are separate — run npm run wire:barber-stripe after keys exist.
 */
import { loadBarberConfig, fail } from './barber-config.js';
import { resolveBarberDatabaseUrl } from './barber-cal-db-events.js';
import { syncBarberCalPayments } from './barber-cal-payments.js';

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: node scripts/enable-barber-cal-payments.js <config.json>');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const dbUrl = await resolveBarberDatabaseUrl(cfg);
  if (!dbUrl) {
    fail('Set CALCOM_DATABASE_URL or RAILWAY_API_TOKEN to reach Cal Postgres.');
  }

  const calBase = cfg.cal_webapp_url?.trim() || `https://${cfg.slug}-cal-production.up.railway.app`;
  console.log(`[payments] Enabling Stripe metadata on @${cfg.slug} event types…`);
  const result = await syncBarberCalPayments(dbUrl, cfg);
  console.log(`[payments] Updated ${result.updated} event type(s).`);

  console.log(`
Next — Stripe on ${calBase}:
  1. npm run wire:barber-stripe -- ${configPath}
     (needs STRIPE_CLIENT_ID, STRIPE_PRIVATE_KEY, NEXT_PUBLIC_STRIPE_PUBLIC_KEY, STRIPE_WEBHOOK_SECRET)
  2. Cal admin → Apps → Stripe → Connect (OAuth) as ${cfg.name}
  3. Webhook: ${calBase}/api/integrations/stripepayment/webhook
     Events: payment_intent.succeeded (and related payment_intent.*)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
