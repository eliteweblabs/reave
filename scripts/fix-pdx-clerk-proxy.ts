import { clerkEnsureDomainProxy, clerkMigratePrimaryDomain, clerkPublishableKey } from '../src/lib/clerkClient.ts';

const host = 'admin.pdx-paws.com';
const proxy = `https://${host}/__clerk`;

const migrated = await clerkMigratePrimaryDomain(host);
console.log('migrate', migrated);

const ensured = await clerkEnsureDomainProxy(proxy);
console.log('ensure', ensured);

console.log('pk', clerkPublishableKey());
