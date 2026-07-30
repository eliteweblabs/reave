/**
 * Shareable vCard for a client to hand out themselves — /c/<uid>/card.vcf
 *
 * Unlike `/c/<uid>.vcf` (staff-only — saving a client's card to a staff
 * member's own phone), this is the client's OWN digital business card: their
 * name, company, phone, email, and website, meant to be sent to their
 * customers/prospects so they can tap "Add to Contacts". Public, gated the
 * same way as the portal page (unguessable uid is the access token; revoked
 * via `enabled:false`). Never includes the internal private `notes` field.
 */
import type { APIRoute } from 'astro';
import { getContact, extractPortal, contactStringField } from '../../../lib/contactApi';
import { contactToVCard } from '../../../lib/carddav/vcard';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const res = await getContact(uid);
  if (!res.ok || res.data.archived) return new Response('Not found', { status: 404 });

  const portal = extractPortal(res.data);
  if (portal && portal.enabled === false) return new Response('Not found', { status: 404 });

  const website = contactStringField(portal?.website);
  const photoUrl = contactStringField(portal?.logoUrl);
  const body = contactToVCard(res.data, { website: website || undefined, photoUrl: photoUrl || undefined });

  const full = contactStringField(res.data.name) || 'contact';
  const filename = `${full.replace(/[^\w.-]+/g, '_') || 'contact'}.vcf`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
