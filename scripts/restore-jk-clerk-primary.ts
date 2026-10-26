import { clerkMigratePrimaryDomain } from '../src/lib/clerkClient.ts';
import { serverEnv } from '../src/lib/serverEnv.ts';

const host = serverEnv('PUBLIC_SITE_DOMAIN') || serverEnv('COMPANY_DOMAIN') || 'jasonkahan.com';
const result = await clerkMigratePrimaryDomain(host.replace(/^https?:\/\//, '').split('/')[0]!);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
