/**
 * Upsert the Cloudflare 301 that strips a trailing FQDN dot
 * (`https://reave.app.` → `https://reave.app/`).
 *
 *   railway run -p <reave.app> -e production -s reave -- \
 *     npx tsx scripts/ensure-fqdn-dot-redirect.ts reave.app
 */
import { cloudflareFindZone, ensureFqdnTrailingDotRedirect } from '../src/lib/cloudflareClient.ts';

const domain = (process.argv[2] || process.env.PUBLIC_SITE_DOMAIN || 'reave.app')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .split('/')[0]
  ?.replace(/\.+$/, '')
  || 'reave.app';

const zone = await cloudflareFindZone(domain);
if (!zone.ok) {
  console.error(zone.error);
  process.exit(1);
}

const out = await ensureFqdnTrailingDotRedirect(zone.data.id);
if (!out.ok) {
  console.error(out.error);
  process.exit(1);
}

console.log(
  `${out.data.action} trailing-dot redirect on ${zone.data.name} (${out.data.snippet_name || out.data.rule_id})`,
);
