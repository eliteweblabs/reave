#!/usr/bin/env npx tsx
/**
 * One-shot: Resend webhook for email.delivered / bounce / complaint → /api/webhooks/resend
 *
 *   npx tsx scripts/wire-resend-transactional-webhook.ts https://reave.app
 */
import { resendEnsureTransactionalEmailWebhook } from '../src/lib/resendDnsSync';

const apex = process.argv[2]?.trim().replace(/\/+$/, '');
if (!apex) {
  console.error('Usage: npx tsx scripts/wire-resend-transactional-webhook.ts https://your-apex-domain');
  process.exit(1);
}

const webhookUrl = `${apex}/api/webhooks/resend`;

async function main() {
  const hook = await resendEnsureTransactionalEmailWebhook(webhookUrl);
  if (!hook.ok) {
    console.error(hook.error);
    process.exit(1);
  }
  console.log(
    hook.created
      ? `Created transactional webhook → ${webhookUrl}`
      : `Updated transactional webhook → ${webhookUrl}`,
  );
  console.log(`Events: ${hook.events.join(', ')}`);
  console.log(`Webhook id: ${hook.id}`);
  if (hook.created) {
    console.log('');
    console.log('If inbound email.received uses a different webhook secret, set on Railway:');
    console.log(`RESEND_TX_WEBHOOK_SECRET=${hook.signingSecret}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
