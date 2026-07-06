#!/usr/bin/env node
/**
 * CLI: sync Resend domain DNS records into Cloudflare.
 * Usage:
 *   npm run sync:resend-dns              # all Resend domains
 *   npm run sync:resend-dns -- reave.app # one domain
 *
 * Loads `.env` from repo root. Requires CLOUDFLARE_API_TOKEN + RESEND_API_KEY.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncAllResendDnsToCloudflare, syncResendDnsToCloudflare } from '../src/lib/resendDnsSync.ts';

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

const domain = process.argv[2]?.trim();

async function main() {
  if (domain) {
    const result = await syncResendDnsToCloudflare(domain);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    console.log(result.summary);
    return;
  }

  const result = await syncAllResendDnsToCloudflare();
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(result.summary);
  for (const d of result.domains) {
    if (d.ok && d.rows.some((r) => r.action !== 'unchanged')) {
      console.log('');
      console.log(d.summary);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
