#!/usr/bin/env node
/**
 * Create (or reuse) a Vapi assistant from Company / install config branding.
 *
 * Usage:
 *   INSTALL_CONFIG=luxe-cleaning VAPI_API_KEY=… node scripts/provision-vapi-assistant.ts
 *   … --print-id          # stdout: assistant uuid only (for deploy scripts)
 *
 * Sets VAPI_CREATE_IF_MISSING=1 by default. Finds an existing assistant by company name
 * before creating a duplicate.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionVapiAssistant } from '../src/lib/vapiAssistantSync.ts';

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

if (process.env.VAPI_CREATE_IF_MISSING == null) {
  process.env.VAPI_CREATE_IF_MISSING = '1';
}

const printIdOnly = process.argv.includes('--print-id');

async function main() {
  const { loadBuildBrandContext, loadBuildEnabledFeatures, loadBuildVapiTemplates } = await import(
    '../src/lib/vapiBuildBrand.ts'
  );
  const enabled = await loadBuildEnabledFeatures();
  if (!enabled.includes('vapi')) {
    console.error('[vapi-provision] vapi not enabled in install config features');
    process.exit(1);
  }
  const brand = await loadBuildBrandContext();
  const templates = await loadBuildVapiTemplates();
  const result = await provisionVapiAssistant(brand, templates);

  if (!result.ok) {
    console.error(`[vapi-provision] failed — ${result.error}`);
    process.exit(1);
  }

  if (printIdOnly) {
    process.stdout.write(result.assistantId);
    return;
  }

  console.log(
    `[vapi-provision] ${result.created ? 'Created' : 'Updated'} assistant ${result.assistantId} for "${result.companyName}"`,
  );
  console.log(`[vapi-provision] firstMessage: ${result.firstMessage}`);
  if (result.phoneAttached && result.phoneNumber) {
    console.log(`[vapi-provision] phone attached: ${result.phoneNumber}`);
  }
  console.log('');
  console.log('Set on Railway (Astro service):');
  console.log(`  PUBLIC_VAPI_ASSISTANT_ID=${result.assistantId}`);
  if (!process.env.PUBLIC_VAPI_PUBLIC_KEY) {
    console.log('  PUBLIC_VAPI_PUBLIC_KEY=<browser key from dashboard.vapi.ai>');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
