import { clerkMigratePrimaryDomain } from '../src/lib/clerkClient.ts';

const result = await clerkMigratePrimaryDomain('rekko.studio');
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
