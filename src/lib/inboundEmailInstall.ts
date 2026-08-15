/**
 * Scope inbound Resend webhooks to this install's domain.
 *
 * Resend `email.received` webhooks are account-wide. Sharing one API key
 * across installs (reave.app + a client) fans every inbound message to every
 * webhook. Each install must ignore mail not addressed to its own domain.
 */
import { parseSenderEmail } from './emailAddress';
import { serverEnv } from './serverEnv';

function trim(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function normalizeEmailHostname(raw: string | null | undefined): string {
  const t = trim(raw)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.toLowerCase()
    .replace(/^www\./, '');
  return t || '';
}

/** Apex + extra hosts this install may receive on (`EMAIL_INBOUND_DOMAINS`). */
export function installEmailDomains(env?: Record<string, string | undefined>): string[] {
  const read = (name: string) => (env ? env[name] : serverEnv(name));

  const extras = (read('EMAIL_INBOUND_DOMAINS') ?? '')
    .split(',')
    .map((s) => normalizeEmailHostname(s))
    .filter(Boolean);

  const domains = [
    normalizeEmailHostname(read('COMPANY_DOMAIN')),
    normalizeEmailHostname(read('PUBLIC_SITE_DOMAIN')),
    ...extras,
  ].filter(Boolean);

  return [...new Set(domains)];
}

export function recipientList(
  ...groups: Array<string | string[] | undefined | null>
): string[] {
  const out: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    if (Array.isArray(group)) {
      for (const item of group) {
        if (item != null && String(item).trim()) out.push(String(item));
      }
    } else if (String(group).trim()) {
      out.push(String(group));
    }
  }
  return out;
}

export function addressBelongsToInstall(
  address: string,
  domains: string[] = installEmailDomains(),
): boolean {
  const email = parseSenderEmail(address);
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const host = email.slice(at + 1).toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Whether this install should ingest the message.
 *
 * - No company domain configured (local/dev): allow.
 * - Recipients present: allow only if one is on this install's domain.
 * - Recipients empty: `requireRecipient: false` lets the webhook proceed to
 *   `receiving.get()`; `true` rejects so we never store unverified mail.
 */
export function inboundBelongsToInstall(
  recipients: string[],
  opts?: { requireRecipient?: boolean; domains?: string[] },
): boolean {
  const domains = opts?.domains ?? installEmailDomains();
  if (!domains.length) return true;
  const addrs = recipients.map((r) => parseSenderEmail(r)).filter((a) => a.includes('@'));
  if (!addrs.length) return opts?.requireRecipient === false;
  return addrs.some((addr) => addressBelongsToInstall(addr, domains));
}

export function inboundMailboxExample(domain: string): string {
  const host = normalizeEmailHostname(domain);
  return host ? `inbox@inbound.${host}` : 'inbox@inbound.example.com';
}
