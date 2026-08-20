/**
 * Pure email-signature HTML/text helpers — no Clerk, company store, or feature flags.
 */
export const EMAIL_SIGNATURE_MARK = 'data-reave-signature';

export type EmailSignaturePrefs = {
  jobTitle: string;
  enabled: boolean;
  includeLogo: boolean;
};

export type EmailSignaturePerson = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  includeLogo: boolean;
  enabled: boolean;
};

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function metaBool(meta: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = meta[key];
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  return fallback;
}

export function parseEmailSignaturePrefs(meta: Record<string, unknown> | null | undefined): EmailSignaturePrefs {
  const m = meta ?? {};
  return {
    jobTitle: trim(m.jobTitle) || trim(m.job_title),
    enabled: metaBool(m, 'signatureEnabled', true),
    includeLogo: metaBool(m, 'signatureIncludeLogo', true),
  };
}

export function emailSignaturePrefsToMetadata(prefs: EmailSignaturePrefs): Record<string, string> {
  return {
    jobTitle: prefs.jobTitle,
    signatureEnabled: prefs.enabled ? '1' : '0',
    signatureIncludeLogo: prefs.includeLogo ? '1' : '0',
  };
}

export function buildEmailSignatureHtml(opts: {
  person: EmailSignaturePerson;
  companyName: string;
  website: string;
  logoUrl: string;
  brandPrimary: string;
}): string {
  const name = opts.person.name.trim() || opts.companyName.trim() || 'Contact';
  const title = opts.person.jobTitle.trim();
  const company = opts.companyName.trim();
  const phone = opts.person.phone.trim();
  const email = opts.person.email.trim();
  const website = opts.website.trim();
  const websiteDisplay = website.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const primary = opts.brandPrimary.trim() || '#c026d3';
  const logoUrl = opts.person.includeLogo ? opts.logoUrl.trim() : '';

  const logoCell = logoUrl
    ? `<td style="padding:0 16px 0 0;vertical-align:top;"><img src="${esc(logoUrl)}" width="64" height="64" alt="${esc(company || name)}" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:8px;" /></td>`
    : '';

  const contactLines: string[] = [];
  if (phone) {
    const tel = phone.replace(/[^\d+]/g, '');
    contactLines.push(
      tel
        ? `<a href="tel:${esc(tel)}" style="color:#444444;text-decoration:none;">${esc(phone)}</a>`
        : esc(phone),
    );
  }
  if (email) {
    contactLines.push(
      `<a href="mailto:${esc(email)}" style="color:#444444;text-decoration:none;">${esc(email)}</a>`,
    );
  }

  const titleLine = title
    ? `<div style="color:${esc(primary)};font-weight:600;margin-top:2px;">${esc(title)}</div>`
    : '';
  const companyLine =
    company && company.toLowerCase() !== name.toLowerCase()
      ? `<div style="color:#555555;margin-top:2px;">${esc(company)}</div>`
      : '';

  return `<table ${EMAIL_SIGNATURE_MARK}="1" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#333333;border-collapse:collapse;"><tr>${logoCell}<td style="border-left:3px solid ${esc(primary)};padding-left:16px;vertical-align:top;"><div style="font-size:15px;font-weight:bold;color:#111111;">${esc(name)}</div>${titleLine}${companyLine}${contactLines.length ? `<div style="margin-top:6px;color:#444444;">${contactLines.join(' &nbsp;|&nbsp; ')}</div>` : ''}${website ? `<div style="margin-top:2px;"><a href="${esc(website)}" style="color:${esc(primary)};text-decoration:none;">${esc(websiteDisplay)}</a></div>` : ''}</td></tr></table>`;
}

export function buildEmailSignatureText(opts: {
  person: EmailSignaturePerson;
  companyName: string;
  website: string;
}): string {
  const name = opts.person.name.trim() || opts.companyName.trim();
  const lines = [
    name,
    opts.person.jobTitle.trim(),
    opts.companyName.trim() && opts.companyName.trim().toLowerCase() !== name.toLowerCase()
      ? opts.companyName.trim()
      : '',
    [opts.person.phone.trim(), opts.person.email.trim()].filter(Boolean).join(' | '),
    opts.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
  ].filter(Boolean);
  return lines.join('\n');
}

export function emailAlreadyHasSignature(html: string | undefined | null): boolean {
  return Boolean(html && html.includes(EMAIL_SIGNATURE_MARK));
}

export function appendSignatureHtml(html: string, signatureHtml: string): string {
  if (!signatureHtml || emailAlreadyHasSignature(html)) return html;
  return `${html}<div style="margin-top:20px">${signatureHtml}</div>`;
}

export function appendSignatureText(text: string, signatureText: string): string {
  const sig = signatureText.trim();
  if (!sig) return text;
  if (text.includes(sig)) return text;
  return `${text.trimEnd()}\n\n--\n${sig}`;
}
