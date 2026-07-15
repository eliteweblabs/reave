#!/usr/bin/env node
/**
 * Sync Vapi assistant name, first message, and system prompt from admin Company details.
 *
 * Runs automatically before `astro build` (see package.json prebuild).
 * Requires VAPI_API_KEY + PUBLIC_VAPI_ASSISTANT_ID (or VAPI_ASSISTANT_ID).
 * Company name/domain come from DATABASE_URL (company_config) or COMPANY_* env vars.
 *
 * Set VAPI_SYNC_SKIP=1 to skip (local builds without Vapi credentials).
 * Set VAPI_SYNC_REQUIRED=1 to fail the build when sync errors.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncVapiAssistantFromConfig } from '../src/lib/vapiAssistantSync.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

async function main() {
  const result = await syncVapiAssistantFromConfig();

  if (result.ok) {
    console.log(
      `[vapi-sync] Updated assistant ${result.assistantId} for "${result.companyName}"`,
    );
    console.log(`[vapi-sync] firstMessage: ${result.firstMessage}`);
    return;
  }

  if (result.skipped) {
    console.log(`[vapi-sync] skipped — ${result.error}`);
    return;
  }

  console.error(`[vapi-sync] failed — ${result.error}`);
  if (process.env.VAPI_SYNC_REQUIRED === '1') {
    process.exit(1);
  }
  console.warn('[vapi-sync] continuing build (set VAPI_SYNC_REQUIRED=1 to fail on error)');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  if (process.env.VAPI_SYNC_REQUIRED === '1') process.exit(1);
});
