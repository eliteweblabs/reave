/**
 * One-shot: point PDX Paws Clerk primary domain at the Railway preview host.
 *
 *   railway run -p … -e production -s pups -- npx tsx scripts/migrate-pdx-clerk-railway-host.ts
 */
import {
  clerkMigratePrimaryDomain,
  clerkPublishableKey,
  clerkPublishableKeyForDomain,
  clerkSecretKey,
} from '../src/lib/clerkClient.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

async function clerkPrimaryDomainName(): Promise<string | null> {
  const secret = clerkSecretKey();
  if (!secret) return null;
  const res = await fetch('https://api.clerk.com/v1/domains', {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: Array<{ name?: string; is_satellite?: boolean }> };
  const row = body.data?.find((d) => d.is_satellite === false) ?? body.data?.[0];
  return row?.name?.replace(/^www\./, '').toLowerCase() ?? null;
}

const primary = await clerkPrimaryDomainName();
const pkHost = clerkPublishableKey()?.startsWith('pk_live_')
  ? Buffer.from(clerkPublishableKey()!.slice(8), 'base64').toString().replace(/\$$/, '').replace(/^clerk\./, '')
  : '';
if (
  primary &&
  (primary === 'rekko.studio' || primary === 'reave.app') &&
  serverEnv('INSTALL_CONFIG')?.trim() === 'pdx-paws'
) {
  console.error(
    'Refusing to migrate: pups is using the hub rekko.studio Clerk secret. Create PDX Paws production in Clerk (`clerk link --app <PDX Paws>`, `clerk deploy`), set install-scoped CLERK_SECRET_KEY + PUBLIC_CLERK_PUBLISHABLE_KEY on Railway, then re-run.',
  );
  process.exit(1);
}
if (primary && pkHost && primary !== pkHost && !pkHost.endsWith(`.${primary}`)) {
  console.error(
    `Refusing to migrate: publishable key is for ${pkHost} but CLERK_SECRET_KEY instance primary is ${primary}. Fix the key pair first.`,
  );
  process.exit(1);
}

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
