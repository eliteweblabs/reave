#!/usr/bin/env node
/**
 * One-shot: inbound.rekko.studio in Resend + Cloudflare DNS + webhook on rekko.studio.
 * Usage: railway run --service reave -- npx tsx scripts/wire-rekko-inbound.ts
 */
import {
  isResendConfigured,
  resendCreateDomain,
  resendGetDomainByName,
  resendEnsureInboundWebhook,
  syncResendDnsToCloudflare,
} from '../src/lib/resendDnsSync.ts';

const apex = 'rekko.studio';
const inbound = `inbound.${apex}`;
const webhookUrl = `https://${apex}/api/email/inbound`;
const from = `noreply@${inbound}`;

async function resendEnableReceiving(domainId: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ capabilities: { sending: 'enabled', receiving: 'enabled' } }),
  });
  return res.ok;
}

async function main() {
  if (!isResendConfigured()) {
    console.error('RESEND_API_KEY not set');
    process.exit(1);
  }

  let domain = await resendGetDomainByName(inbound);
  if (!domain.ok) {
    const created = await resendCreateDomain(inbound);
    if (!created.ok) {
      console.error('Resend create failed:', created.error);
      process.exit(1);
    }
    console.log(`Created Resend domain ${inbound} (${created.status})`);
    domain = await resendGetDomainByName(inbound);
  } else {
    console.log(`Resend domain ${domain.detail.name} (${domain.detail.status})`);
  }

  if (domain.ok && domain.detail.capabilities?.receiving !== 'enabled') {
    const ok = await resendEnableReceiving(domain.detail.id);
    console.log(ok ? 'Enabled Resend receiving' : 'Failed to enable receiving');
    domain = await resendGetDomainByName(inbound);
  }

  const dns = await syncResendDnsToCloudflare(inbound);
  if (!dns.ok) {
    console.error('DNS sync:', dns.error);
    process.exit(1);
  }
  console.log(dns.summary);

  const hook = await resendEnsureInboundWebhook(webhookUrl);
  if (!hook.ok) {
    console.error('Webhook:', hook.error);
    process.exit(1);
  }
  console.log(`Webhook ${hook.created ? 'created' : 'reused'} → ${webhookUrl}`);
  console.log(`Set Railway: RESEND_FROM=${from} EMAIL_FROM=${from}`);
  if (hook.created) {
    console.log('New webhook secret — update RESEND_WEBHOOK_SECRET on reave if verify fails');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
