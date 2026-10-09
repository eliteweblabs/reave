#!/usr/bin/env node
/**
 * Create Cal.com event types from configs/*.json (after Cal.com onboarding).
 *
 * Self-hosted cal.com Docker shows API keys as a commercial feature — default path
 * writes directly to Postgres (same approach as reave calcomOwnerProvision).
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… npm run add:barber-events -- configs/stevendiaz.json
 *   CALCOM_DATABASE_URL=postgresql://… npm run add:barber-events -- configs/stevendiaz.json
 *
 * Optional API path (requires Cal commercial / license):
 *   CALCOM_API_KEY=cal_… npm run add:barber-events -- configs/stevendiaz.json
 */
import { loadBarberConfig, fail } from './barber-config.js';
import {
  resolveCalWebappFromRailway,
  resolveCalWebappUrl,
  syncBarberCalEventTypes,
} from './barber-cal-events.js';
import { resolveBarberDatabaseUrl, syncBarberEventTypesToDatabase } from './barber-cal-db-events.js';

function log(msg) {
  console.log(msg);
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    fail('Usage: node scripts/add-barber-events.js <config.json>');
  }

  const cfg = loadBarberConfig(configPath, { strict: false });
  const apiKey = process.env.CALCOM_API_KEY?.trim();
  const dbUrl = await resolveBarberDatabaseUrl(cfg);

  if (dbUrl && !process.env.CALCOM_FORCE_API?.trim()) {
    log(`[cal-db] Syncing ${cfg.services.length} event type(s) for @${cfg.slug}…`);
    const result = await syncBarberEventTypesToDatabase(dbUrl, cfg);
    for (const slug of result.skipped) log(`  skip (exists): ${slug}`);
    log(`Done. ${result.created} created, ${result.skipped.length} skipped.`);
    log(`Refresh Event types in Cal — hide/delete the default 15/30 min if you want only the menu.`);
    return;
  }

  if (!apiKey) {
    fail(
      'Could not resolve Cal Postgres URL (set CALCOM_DATABASE_URL or RAILWAY_API_TOKEN). ' +
        'Cal.com API keys are a commercial feature on self-hosted cal.com — DB seed is the default path.',
    );
  }

  let webappUrl = resolveCalWebappUrl(cfg);
  const fromRailway = await resolveCalWebappFromRailway(cfg);
  if (fromRailway && !process.env.CALCOM_WEBAPP_URL?.trim() && !cfg.cal_webapp_url?.trim()) {
    webappUrl = fromRailway;
    log(`[cal-api] Using Railway NEXT_PUBLIC_WEBAPP_URL → ${webappUrl}`);
  }

  log(`[cal-api] Syncing via API (requires commercial license)…`);
  const result = await syncBarberCalEventTypes(webappUrl, apiKey, cfg.name, cfg.services);
  if (!result.ok) fail(result.message);

  for (const slug of result.skipped ?? []) log(`  skip (exists): ${slug}`);
  for (const row of result.created ?? []) log(`  ✓ ${row.slug} → id ${row.id}`);
  log(`Book: ${result.webappUrl}/${cfg.slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
