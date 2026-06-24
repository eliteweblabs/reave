/**
 * GET /api/email/rules — rule table for the dashboard flow visualization.
 */
import type { APIRoute } from 'astro';
import { DEFAULT_RULES, NOTIFY_ON_UNMATCHED } from '../../../lib/emailRules';

export const prerender = false;

/** Future / not-yet-implemented steps shown as ghost nodes in the Rules tab. */
const PLANNED_STEPS = [
  {
    afterStatus: 'DOWN',
    title: 'Follow-up check',
    description: 'After ~2h, recheck URL → Telegram: Mark resolved / Ignore / Keep alerting',
  },
  {
    afterStatus: 'RECEIPT',
    title: 'Archive + label',
    description: 'Proton/Gmail label Receipts and archive from inbox',
  },
];

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      source: 'src/lib/emailRules.ts',
      pipeline: {
        inbound: 'POST /api/email/inbound (Resend webhook)',
        handler: 'classifyEmail() → handleInboundEmail()',
        legacy: 'openclaw-email-tools polls Gmail IMAP separately (same rule ideas)',
      },
      notifyOnUnmatched: NOTIFY_ON_UNMATCHED,
      rules: DEFAULT_RULES,
      planned: PLANNED_STEPS,
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};
