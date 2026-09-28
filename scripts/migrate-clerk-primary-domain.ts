/**
 * Move the Clerk instance primary domain + /__clerk proxy to a new apex (e.g. rekko.studio).
 * Run on production with CLERK_SECRET_KEY set:
 *
 *   railway link -p af65eb9a-b11c-4c1c-8030-66b4347dcf71 -e production -s reave
 *   railway run -- npx tsx scripts/migrate-clerk-primary-domain.ts rekko.studio
 *
 *   (Project display name is "rekko studio"; -p reave.app no longer resolves.)
 *
 * If a new publishable key is returned, set PUBLIC_CLERK_PUBLISHABLE_KEY on the reave service
 * and redeploy. Clear PUBLIC_CLERK_JS_URL unless it matches the new clerk.{apex} host.
 */
import { clerkMigratePrimaryDomain, clerkPublishableKeyForDomain } from '../src/lib/clerkClient.ts';

const apex = (process.argv[2] || 'rekko.studio')
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .split('/')[0]
  ?.toLowerCase();

if (!apex) {
  console.error('Usage: migrate-clerk-primary-domain.ts <apex-domain>');
  process.exit(1);
}

const result = await clerkMigratePrimaryDomain(apex);
if (!result.ok) {
  console.error('Clerk domain migration failed:', result.error || 'unknown');
  process.exit(1);
}

if (result.skipped) {
  console.log(`Clerk primary domain already set for ${apex} (or skipped in test mode).`);
} else {
  console.log(`Clerk primary domain migrated to ${apex}.`);
}

const pk = result.publishableKey ?? clerkPublishableKeyForDomain(apex);
if (pk) {
  console.log('\nSet on Railway → reave service → Variables:');
  console.log(`PUBLIC_CLERK_PUBLISHABLE_KEY=${pk}`);
  console.log('\nThen remove or update PUBLIC_CLERK_JS_URL to the new clerk host if present.');
} else {
  console.log('\nNo derived publishable key — confirm keys in Clerk Dashboard → API Keys.');
}

console.log('\nClerk Dashboard → Domains: verify primary is', apex);
console.log('Allowed redirect URLs should include https://' + apex + '/admin/*');
