/**
 * Account-profile email signature — table-based HTML for Gmail/Outlook.
 *
 * Built from Admin → Profile (name, title, phone, email) plus company
 * branding (logo, color, website). Used by the profile preview, the public
 * /signature.html copy page, and outbound compose/agent mail.
 */
import { clerkGetUser } from './clerkClient';
import { getCompanyConfig, type CompanyConfig } from './companyConfig';
import { siteBaseUrl } from './requestOrigin';
import { agentAlertUserId } from './systemAlertsThread';
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';
import {
  appendSignatureHtml,
  appendSignatureText,
  buildEmailSignatureHtml,
  buildEmailSignatureText,
  parseEmailSignaturePrefs,
  type EmailSignaturePerson,
} from './emailSignatureFormat';

export {
  EMAIL_SIGNATURE_MARK,
  appendSignatureHtml,
  appendSignatureText,
  buildEmailSignatureHtml,
  buildEmailSignatureText,
  emailAlreadyHasSignature,
  emailSignaturePrefsToMetadata,
  parseEmailSignaturePrefs,
  type EmailSignaturePerson,
  type EmailSignaturePrefs,
} from './emailSignatureFormat';

export type EmailSignatureRender = {
  html: string;
  text: string;
  person: EmailSignaturePerson;
  companyName: string;
  logoUrl: string;
  website: string;
  publicUrl: string;
};

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function logoAbsoluteUrl(company: CompanyConfig, base: string): string {
  const path = company.logoPath?.trim();
  if (!path || company.logoSource === 'hidden') return '';
  if (/^https?:\/\//i.test(path)) {
    return company.logoVersion ? `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(company.logoVersion)}` : path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const withVersion = company.logoVersion
    ? `${normalized}${normalized.includes('?') ? '&' : '?'}v=${encodeURIComponent(company.logoVersion)}`
    : normalized;
  return `${base.replace(/\/$/, '')}${withVersion}`;
}

function companyWebsite(company: CompanyConfig, base: string): string {
  if (company.domain) return `https://${company.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return base.replace(/\/$/, '');
}

function personFromClerkPayload(user: {
  first_name?: string | null;
  last_name?: string | null;
  email_addresses?: Array<{ email_address?: string }>;
  public_metadata?: Record<string, unknown>;
}): EmailSignaturePerson {
  const prefs = parseEmailSignaturePrefs(user.public_metadata);
  const name = [user.first_name, user.last_name].map((p) => trim(p)).filter(Boolean).join(' ');
  return {
    name,
    email: trim(user.email_addresses?.[0]?.email_address),
    phone: trim(user.public_metadata?.phone),
    jobTitle: prefs.jobTitle,
    includeLogo: prefs.includeLogo,
    enabled: prefs.enabled,
  };
}

async function fetchClerkPublicMetadata(userId: string): Promise<Record<string, unknown>> {
  const secretKey = serverEnv('CLERK_SECRET_KEY') || serverEnv('CLERK_BACKEND_API_KEY');
  if (!secretKey) return {};
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, unknown>;
    return (data.public_metadata as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export async function resolveEmailSignaturePerson(
  userId?: string | null,
): Promise<EmailSignaturePerson | null> {
  const id = trim(userId) || agentAlertUserId();
  if (!id) return null;
  const [userRes, meta] = await Promise.all([clerkGetUser(id), fetchClerkPublicMetadata(id)]);
  if (!userRes.ok || !userRes.user) return null;
  return personFromClerkPayload({
    first_name: userRes.user.first_name,
    last_name: userRes.user.last_name,
    email_addresses: userRes.user.email_addresses,
    public_metadata: meta,
  });
}

export function renderEmailSignature(opts: {
  person: EmailSignaturePerson;
  company: CompanyConfig;
  baseUrl?: string;
}): EmailSignatureRender {
  const base = (opts.baseUrl || siteBaseUrl()).replace(/\/$/, '');
  const website = companyWebsite(opts.company, base);
  const logoUrl = logoAbsoluteUrl(opts.company, base);
  const brandPrimary = opts.company.brandPrimary || '#c026d3';
  const html = buildEmailSignatureHtml({
    person: opts.person,
    companyName: opts.company.name,
    website,
    logoUrl,
    brandPrimary,
  });
  const text = buildEmailSignatureText({
    person: opts.person,
    companyName: opts.company.name,
    website,
  });
  return {
    html,
    text,
    person: opts.person,
    companyName: opts.company.name,
    logoUrl,
    website,
    publicUrl: `${base}/signature.html`,
  };
}

export async function buildAccountEmailSignature(opts?: {
  userId?: string | null;
}): Promise<EmailSignatureRender | null> {
  if (!hasFeature('email_signature')) return null;
  const person = await resolveEmailSignaturePerson(opts?.userId);
  if (!person || !person.enabled) return null;
  if (!person.name && !person.email && !person.phone) return null;
  const company = await getCompanyConfig();
  return renderEmailSignature({ person, company });
}

/** Append the account signature to outbound compose/agent mail when the module is on. */
export async function applyOutboundEmailSignature(opts: {
  text: string;
  html?: string;
  userId?: string | null;
}): Promise<{ text: string; html?: string }> {
  if (!hasFeature('email_signature')) return { text: opts.text, html: opts.html };
  const rendered = await buildAccountEmailSignature({ userId: opts.userId });
  if (!rendered) return { text: opts.text, html: opts.html };
  return {
    text: appendSignatureText(opts.text, rendered.text),
    html: opts.html ? appendSignatureHtml(opts.html, rendered.html) : undefined,
  };
}
