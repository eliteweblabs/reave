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
import { syncBarberCalPaymentMode } from './barber-cal-payments.js';
import { barberPaymentMode } from '../src/lib/barberPayments.ts';

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: node scripts/enable-barber-cal-payments.js <config.json>');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const dbUrl = await resolveBarberDatabaseUrl(cfg);
  if (!dbUrl) {
    fail('Set CALCOM_DATABASE_URL or RAILWAY_API_TOKEN to reach Cal Postgres.');
  }

  const calBase = cfg.cal_webapp_url?.trim() || `https://${cfg.slug}-cal-production.up.railway.app`;
  const mode = barberPaymentMode(cfg);
  console.log(`[payments] Syncing ${mode} payment mode on @${cfg.slug} event types…`);
  const result = await syncBarberCalPaymentMode(dbUrl, cfg);
  console.log(`[payments] Updated ${result.updated} event type(s) (${result.mode}).`);

  if (result.mode === 'stripe') {
    console.log(`
Next — Stripe on ${calBase}:
  1. npm run wire:barber-stripe -- ${configPath}
     (needs STRIPE_CLIENT_ID, STRIPE_PRIVATE_KEY, NEXT_PUBLIC_STRIPE_PUBLIC_KEY, STRIPE_WEBHOOK_SECRET)
  2. Cal admin → Apps → Stripe → Connect (OAuth) as ${cfg.name}
  3. Webhook: ${calBase}/api/integrations/stripepayment/webhook
     Events: payment_intent.succeeded (and related payment_intent.*)
`);
  } else {
    console.log(`
P2P mode — no Stripe on Cal. Set handles in config payments{} and site PUBLIC_P2P_* env.
Book flow: /book → pay via Venmo / Cash App / Zelle / cash, then confirm in Cal embed.
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
