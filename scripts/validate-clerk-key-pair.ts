/**
 * Fail fast when PUBLIC_CLERK_PUBLISHABLE_KEY encodes a different FAPI host than
 * the Clerk instance behind CLERK_SECRET_KEY (common when pk is updated but sk is inherited).
 */
import { clerkPublishableKey, clerkSecretKey } from '../src/lib/clerkClient.ts';
import { clerkFrontendApiHost } from '../src/lib/clerkClient.ts';

async function primaryDomainName(): Promise<string | null> {
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

const pk = clerkPublishableKey();
const pkHost = clerkFrontendApiHost(pk)?.replace(/^clerk\./, '');
const primary = await primaryDomainName();

console.log(JSON.stringify({ pkHost, primary, match: pkHost === primary || pkHost?.endsWith(`.${primary}`) }, null, 2));
if (pkHost && primary && pkHost !== primary && !pkHost.endsWith(`.${primary}`)) {
  process.exit(2);
}
