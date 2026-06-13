/**
 * vCard export for a client portal — /c/<uid>.vcf
 *
 * Opens natively in iOS Contacts ("Add to Contacts"). Only client-safe fields
 * are included (name, company, email, phone, portal URL) — never the internal
 * private `notes` field. Gated the same way as the portal page: the contact must
 * have a portal that isn't revoked.
 */
import type { APIRoute } from 'astro';
import { getContact, extractPortal, clientPortalUrl } from '../../lib/contactApi';

export const prerender = false;

/** Escape per RFC 6350 §3.4 (backslash, comma, semicolon, newline). */
function esc(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const res = await getContact(uid);
  if (!res.ok || res.data.archived) return new Response('Not found', { status: 404 });

  const portal = extractPortal(res.data);
  if (!portal || portal.enabled === false) return new Response('Not found', { status: 404 });

  const c = res.data;
  const first = (c.firstName ?? '').trim();
  const last = (c.lastName ?? '').trim();
  const full = (c.name ?? '').trim() || [first, last].filter(Boolean).join(' ') || 'Client';

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${esc(last)};${esc(first)};;;`);
  lines.push(`FN:${esc(full)}`);
  if (c.company?.trim()) lines.push(`ORG:${esc(c.company.trim())}`);
  if (c.phone?.trim()) lines.push(`TEL;TYPE=CELL:${esc(c.phone.trim())}`);
  if (c.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email.trim())}`);
  lines.push(`URL:${esc(clientPortalUrl(uid))}`);
  lines.push('END:VCARD');

  const body = lines.join('\r\n') + '\r\n';
  const filename = `${full.replace(/[^\w.-]+/g, '_') || 'contact'}.vcf`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
