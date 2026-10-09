#!/usr/bin/env node
/**
 * Push Stripe env vars onto {slug}-cal on Railway (from process.env).
 *
 *   STRIPE_CLIENT_ID=ca_… STRIPE_PRIVATE_KEY=sk_… \\
 *   NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_… STRIPE_WEBHOOK_SECRET=whsec_… \\
 *   RAILWAY_API_TOKEN=… npm run wire:barber-stripe -- configs/stevendiaz.json
 */
import { loadBarberConfig, fail } from './barber-config.js';
import { railwayGql, resolveBarberCalService } from './barber-cal-railway.js';

const KEYS = [
  'STRIPE_CLIENT_ID',
  'STRIPE_PRIVATE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLIC_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

function pickStripeEnv() {
  const out = {};
  for (const name of KEYS) {
    const v = process.env[name]?.trim();
    if (!v) fail(`Missing ${name} in environment`);
    out[name] = v;
  }
  return out;
}

async function upsertVar(projectId, environmentId, serviceId, name, value) {
  await railwayGql(
    `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    {
      input: { projectId, environmentId, serviceId, name, value },
    },
  );
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: node scripts/wire-barber-cal-stripe-env.js <config.json>');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const vars = pickStripeEnv();
  const calName = `${cfg.slug}-cal`;
  const { project, env, svc } = await resolveBarberCalService(cfg.name, calName);

  for (const [name, value] of Object.entries(vars)) {
    await upsertVar(project.id, env.id, svc.id, name, value);
    console.log(`[railway] ✓ ${calName}.${name}`);
  }

  const calBase = cfg.cal_webapp_url?.trim() || `https://${cfg.slug}-cal-production.up.railway.app`;
  console.log(`
Stripe env set on ${calName}. Redeploy if needed.
Webhook URL: ${calBase}/api/integrations/stripepayment/webhook
OAuth redirect: ${calBase}/api/integrations/stripepayment/callback
Then in Cal: Settings → Apps → Stripe → Connect as ${cfg.slug}.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
