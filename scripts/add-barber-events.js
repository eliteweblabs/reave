#!/usr/bin/env node
/**
 * Create Cal.com event types from a barber config (after Cal.com onboarding).
 *
 * Usage:
 *   CALCOM_API_KEY=cal_… npm run add:barber-events -- configs/stevendiaz.json
 *
 * Calendar URL (first match wins):
 *   CALCOM_WEBAPP_URL, config.cal_webapp_url, Railway NEXT_PUBLIC_WEBAPP_URL (if RAILWAY_API_TOKEN),
 *   or https://{slug}-cal-production.up.railway.app
 */
import { loadBarberConfig, fail } from './barber-config.js';
import {
  resolveCalWebappFromRailway,
  resolveCalWebappUrl,
  syncBarberCalEventTypes,
} from './barber-cal-events.js';

function log(msg) {
  console.log(msg);
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    fail('Usage: node scripts/add-barber-events.js <config.json>');
  }

  const apiKey = process.env.CALCOM_API_KEY?.trim();
  if (!apiKey) {
    fail(
      'CALCOM_API_KEY is not set. In Cal.com: Settings → Developer → API Keys, then export CALCOM_API_KEY and re-run.',
    );
  }

  const cfg = loadBarberConfig(configPath, { strict: false });

  let webappUrl = resolveCalWebappUrl(cfg);
  const fromRailway = await resolveCalWebappFromRailway(cfg);
  if (fromRailway && !process.env.CALCOM_WEBAPP_URL?.trim() && !cfg.cal_webapp_url?.trim()) {
    webappUrl = fromRailway;
    log(`[cal] Using Railway NEXT_PUBLIC_WEBAPP_URL → ${webappUrl}`);
  } else {
    log(`[cal] Webapp URL → ${webappUrl}`);
  }

  log(`[cal] Syncing ${cfg.services.length} service(s) for ${cfg.name}…`);
  const result = await syncBarberCalEventTypes(webappUrl, apiKey, cfg.name, cfg.services);

  if (!result.ok) {
    if (result.unauthorized) fail(result.message);
    if (result.created?.length) {
      log(`Partial: created ${result.created.map((c) => c.slug).join(', ')} before error`);
    }
    fail(result.message);
  }

  for (const slug of result.skipped ?? []) {
    log(`  skip (exists): ${slug}`);
  }
  for (const row of result.created ?? []) {
    log(`  ✓ ${row.slug} → id ${row.id}`);
  }

  if (!result.created?.length && (result.skipped?.length ?? 0) > 0) {
    log('All event types already exist — nothing to add.');
  } else {
    log(`Done. ${result.created?.length ?? 0} created, ${result.skipped?.length ?? 0} skipped.`);
  }
  log(`Book: ${result.webappUrl}/${cfg.slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
