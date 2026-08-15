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

function readEnv(
  name: string,
  env?: Record<string, string | undefined>,
): string {
  return trim(env ? env[name] : serverEnv(name));
}

/** Skip Railway private / default public hosts — they are not inbound MX. */
function isMailDomainHost(host: string): boolean {
  if (!host) return false;
  if (host.endsWith('.railway.internal')) return false;
  if (host.endsWith('.up.railway.app')) return false;
  if (host === 'railway.app' || host.endsWith('.railway.app')) return false;
  return true;
}

export function isRailwayRuntime(env?: Record<string, string | undefined>): boolean {
  return Boolean(readEnv('RAILWAY_ENVIRONMENT', env) || readEnv('RAILWAY_PUBLIC_DOMAIN', env));
}

/** Apex + extra hosts this install may receive on (`EMAIL_INBOUND_DOMAINS`). */
export function installEmailDomains(env?: Record<string, string | undefined>): string[] {
  const extras = (readEnv('EMAIL_INBOUND_DOMAINS', env) ?? '')
    .split(',')
    .map((s) => normalizeEmailHostname(s))
    .filter(Boolean);

  const domains = [
    normalizeEmailHostname(readEnv('COMPANY_DOMAIN', env)),
    normalizeEmailHostname(readEnv('PUBLIC_SITE_DOMAIN', env)),
    normalizeEmailHostname(readEnv('PUBLIC_SITE_URL', env)),
    normalizeEmailHostname(readEnv('RAILWAY_PUBLIC_DOMAIN', env)),
    ...extras,
  ].filter((host) => isMailDomainHost(host));

  const slug = readEnv('INSTALL_CONFIG', env).toLowerCase();
  if (slug === 'reave') domains.push('reave.app');

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
 * - On Railway with no resolvable domain: reject (shared Resend keys fan out).
 * - Recipients present: allow only if one is on this install's domain.
 * - Recipients empty: `requireRecipient: false` lets the webhook proceed to
 *   `receiving.get()`; `true` rejects so we never store unverified mail.
 */
export function inboundBelongsToInstall(
  recipients: string[],
  opts?: {
    requireRecipient?: boolean;
    domains?: string[];
    env?: Record<string, string | undefined>;
  },
): boolean {
  const domains = opts?.domains ?? installEmailDomains(opts?.env);
  if (!domains.length) return !isRailwayRuntime(opts?.env);
  const addrs = recipients.map((r) => parseSenderEmail(r)).filter((a) => a.includes('@'));
  if (!addrs.length) return opts?.requireRecipient === false;
  return addrs.some((addr) => addressBelongsToInstall(addr, domains));
}

export function inboundMailboxExample(domain: string): string {
  const host = normalizeEmailHostname(domain);
  return host ? `inbox@inbound.${host}` : 'inbox@inbound.example.com';
}
