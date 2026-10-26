import { absoluteClerkProxyUrl } from '../src/lib/clerkFrontendProxy.ts';
import { clerkPublishableKey, clerkSecretKey } from '../src/lib/clerkClient.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

async function backendGet(path: string) {
  const key = clerkSecretKey();
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const domains = await backendGet('/domains');
console.log('pk', clerkPublishableKey());
console.log('CLERK_PRIMARY', serverEnv('CLERK_PRIMARY_DOMAIN'));
console.log('PUBLIC_CLERK_PROXY_URL', serverEnv('PUBLIC_CLERK_PROXY_URL'));
console.log(
  'absoluteClerkProxyUrl admin',
  absoluteClerkProxyUrl(
    new Request('https://admin.pdx-paws.com/admin/__clerk/v1/environment', {
      headers: { Host: 'admin.pdx-paws.com', 'X-Forwarded-Proto': 'https' },
    }),
  ),
);
console.log('domains', JSON.stringify(domains, null, 2));
