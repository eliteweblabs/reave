/**
 * Run: EMAIL_INBOUND_FILTER=0 npm run backfill:resend-inbound [-- --dry-run --max=50]
 */
import { backfillResendInbound } from '../src/lib/backfillResendInbound.ts';

const dryRun = process.argv.includes('--dry-run');
const maxIdx = process.argv.findIndex((a) => a === '--max');
const max =
  maxIdx >= 0 && process.argv[maxIdx + 1]
    ? Math.min(Math.max(Number(process.argv[maxIdx + 1]) || 100, 1), 2000)
    : 300;

const result = await backfillResendInbound({ dryRun, max });
console.log(JSON.stringify(result, null, 2));
