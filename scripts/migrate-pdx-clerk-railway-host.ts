/**
 * One-shot: point PDX Paws Clerk primary domain at the Railway preview host.
 *
 *   railway run -p … -e production -s pups -- npx tsx scripts/migrate-pdx-clerk-railway-host.ts
 */
import { clerkMigratePrimaryDomain, clerkPublishableKeyForDomain } from '../src/lib/clerkClient.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

/** Clerk production instances cannot use *.railway.app — use the live admin host. */
const host =
  serverEnv('CLERK_PRIMARY_DOMAIN')?.trim() ||
  serverEnv('PLANNED_SITE_DOMAIN')?.trim()?.replace(/^pdx-paws\.com$/i, 'admin.pdx-paws.com') ||
  'admin.pdx-paws.com';

const result = await clerkMigratePrimaryDomain(host);
if (!result.ok) {
  console.error(result.error || 'Clerk migrate failed');
  process.exit(1);
}

const pk = result.publishableKey || clerkPublishableKeyForDomain(host);
console.log(
  JSON.stringify({
    host,
    skipped: result.skipped,
    publishableKey: pk ?? null,
  }),
);
