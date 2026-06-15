/**
 * Plain-text client summary for Apple Notes sync (/c/<uid>/note.txt).
 *
 * Apple Notes has no API, so true sync isn't possible. This endpoint is the
 * server side of a one-way "pull" demo: an Apple Shortcut on the iPhone fetches
 * this text and creates/updates a Note. Same gating as the portal page (any
 * non-archived contact unless the portal is explicitly revoked). The uid is an
 * unguessable UUID, so the URL itself is the access token.
 *
 * Only client-safe data is included — never the private internal `notes` field.
 */
import type { APIRoute } from 'astro';
import { getContact, extractPortal, clientPortalUrl } from '../../../lib/contactApi';
import { isCraterConfigured, craterGetClientBilling } from '../../../lib/craterClient';

export const prerender = false;

const money = (n: number) => `$${Number(n).toFixed(2)}`;

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  const notFound = () =>
    new Response('This client page is not available.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  if (!uid) return notFound();

  const res = await getContact(uid);
  if (!res.ok || res.data.archived) return notFound();

  const portal = extractPortal(res.data);
  if (portal && portal.enabled === false) return notFound();

  const c = res.data;
  const lines: string[] = [];

  lines.push(c.name || 'Client');
  if (c.company?.trim()) lines.push(c.company.trim());
  lines.push('');

  if (c.phone?.trim()) lines.push(`Phone: ${c.phone.trim()}`);
  if (c.email?.trim()) lines.push(`Email: ${c.email.trim()}`);
  lines.push(`Portal: ${clientPortalUrl(uid)}`);

  if (portal?.headline?.trim() || portal?.body?.trim()) {
    lines.push('');
    if (portal.headline?.trim()) lines.push(`— ${portal.headline.trim()} —`);
    if (portal.body?.trim()) lines.push(portal.body.trim());
  }

  const fields = (portal?.fields ?? []).filter((f) => f && f.label && f.value);
  if (fields.length > 0) {
    lines.push('');
    for (const f of fields) lines.push(`${f.label}: ${f.value}`);
  }

  if (isCraterConfigured()) {
    const b = await craterGetClientBilling({ email: c.email ?? undefined, name: c.name });
    if (b.ok && b.data) {
      const bill = b.data;
      if (bill.outstanding.length > 0) {
        lines.push('');
        lines.push(`Outstanding balance: ${money(bill.totalDue)}`);
        for (const inv of bill.outstanding) {
          const pay = inv.url ? ` — Pay: ${inv.url}` : '';
          lines.push(`  #${inv.number}  ${money(inv.due)}  (${inv.status})${pay}`);
        }
      }
      if (bill.upcoming.length > 0) {
        lines.push('');
        lines.push('Upcoming:');
        for (const r of bill.upcoming) {
          const when = r.nextAt ? ` — next ${new Date(r.nextAt).toLocaleDateString('en-US')}` : '';
          lines.push(`  ${r.frequency || 'Recurring'}  ${money(r.total)}${when}`);
        }
      }
    }
  }

  lines.push('');
  lines.push(`Updated ${new Date().toLocaleString('en-US')} · via Reave Automatic`);

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
