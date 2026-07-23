/**
 * Public company vCard — /contact.vcf
 *
 * Lets client-portal visitors save the business to Contacts (iOS opens
 * "Add to Contacts" natively). Includes only public company fields.
 */
import type { APIRoute } from 'astro';
import { getCompanyConfig } from '../lib/companyConfig';
import { escVCard, foldLine } from '../lib/carddav/vcard';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const org = await getCompanyConfig(request);
  const name = org.name?.trim() || 'Contact';
  const phone = org.supportPhone?.trim() || '';
  const email = org.supportEmail?.trim() || '';
  const siteUrl = org.domain
    ? `https://${org.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : '';

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(foldLine(`FN:${escVCard(name)}`));
  lines.push(foldLine(`N:;${escVCard(name)};;;`));
  if (org.legalName?.trim() && org.legalName.trim() !== name) {
    lines.push(foldLine(`ORG:${escVCard(org.legalName.trim())}`));
  } else {
    lines.push(foldLine(`ORG:${escVCard(name)}`));
  }
  if (phone) lines.push(foldLine(`TEL;TYPE=WORK,VOICE:${escVCard(phone)}`));
  if (email) lines.push(foldLine(`EMAIL;TYPE=INTERNET:${escVCard(email)}`));
  if (siteUrl) lines.push(foldLine(`URL:${escVCard(siteUrl)}`));
  lines.push('END:VCARD');

  const body = lines.join('\r\n') + '\r\n';
  const filename = `${name.replace(/[^\w.-]+/g, '_') || 'contact'}.vcf`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
