/**
 * Scope Resend sent-mail listings to this install's outbound From addresses.
 * Shared RESEND_API_KEY accounts fan out every send — each install only shows its own.
 */
import { parseSenderEmail } from './emailAddress';
import { getCompanyConfig } from './companyConfig';
import { installEmailDomains, normalizeEmailHostname } from './inboundEmailInstall';
import { canonicalizeReaveBrandEmail } from './reavePublicEmail';
import { serverEnv } from './serverEnv';

function emailHost(email: string): string {
  const bare = parseSenderEmail(email);
  return bare.split('@')[1]?.toLowerCase() || '';
}

function addAddress(set: Set<string>, raw: string | null | undefined): void {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return;
  const bare = canonicalizeReaveBrandEmail(parseSenderEmail(trimmed));
  if (bare.includes('@')) set.add(bare);
}

/** Bare From addresses this install may send as (env + company profile). */
export async function installOutboundFromAddresses(): Promise<Set<string>> {
  const out = new Set<string>();
  addAddress(out, serverEnv('RESEND_FROM'));
  addAddress(out, serverEnv('EMAIL_FROM'));
  const company = await getCompanyConfig();
  addAddress(out, company.fromEmail);
  return out;
}

/** Hostnames allowed on the From header for this install. */
export async function installOutboundDomains(): Promise<Set<string>> {
  const domains = new Set<string>();
  for (const host of installEmailDomains()) {
    if (host) domains.add(host);
    domains.add(`inbound.${host}`);
  }
  const company = await getCompanyConfig();
  const fromHost = emailHost(company.fromEmail || '');
  if (fromHost) domains.add(fromHost);
  for (const envName of ['RESEND_FROM', 'EMAIL_FROM'] as const) {
    const h = emailHost(serverEnv(envName) || '');
    if (h) domains.add(h);
  }
  return domains;
}

export async function resendSendBelongsToInstall(fromHeader: string | null | undefined): Promise<boolean> {
  const from = (fromHeader ?? '').trim();
  if (!from) return false;

  const email = canonicalizeReaveBrandEmail(parseSenderEmail(from));
  const host = normalizeEmailHostname(emailHost(email));
  if (!email.includes('@') || !host) return false;

  const allowedEmails = await installOutboundFromAddresses();
  if (allowedEmails.has(email)) return true;

  const allowedDomains = await installOutboundDomains();
  if (allowedDomains.has(host)) return true;

  // Subdomain sends on the install apex (e.g. noreply@inbound.lux.cleaning).
  for (const apex of allowedDomains) {
    if (host === apex || host.endsWith(`.${apex}`)) return true;
  }
  return false;
}
